package com.galaksiya.api;

import com.galaksiya.api.agent.BrandSearcherAgent;
import com.galaksiya.api.agent.ConsentSearcherAgent;
import com.galaksiya.api.agent.SyncResponseAgent;
import com.galaksiya.api.agent.agentextensions.BaseAgent;
import com.galaksiya.api.agent.agentextensions.ConsumerProvider;
import com.galaksiya.api.configuration.ApiConfig;
import com.galaksiya.api.configuration.TopicNameGenerator;
import com.galaksiya.api.service.GlobalContext;
import com.galaksiya.api.service.utils.BlockedIysCodes;
import com.galaksiya.datamanager.pulsar.PulsarInstance;
import com.galaksiya.datamanager.utils.Constants;
import com.galaksiya.iys.configuration.MiddlewareConfig;
import com.galaksiya.iys.utils.IysTerminator;
import com.galaksiya.logger.GLogger;
import com.galaksiya.logger.OperationLog;
import com.iys.config.EnvironmentConfiguration;
import org.apache.logging.log4j.Level;
import org.apache.pulsar.client.admin.PulsarAdminException;
import org.apache.pulsar.client.api.Consumer;
import org.apache.pulsar.client.api.ConsumerBuilder;
import org.apache.pulsar.client.api.PulsarClientException;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.eclipse.jetty.server.handler.HandlerList;
import org.eclipse.jetty.servlet.FilterHolder;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.servlet.ServletHolder;
import org.eclipse.jetty.servlets.DoSFilter;
import org.eclipse.jetty.util.thread.QueuedThreadPool;
import org.glassfish.jersey.servlet.ServletContainer;

import javax.servlet.DispatcherType;
import javax.servlet.ServletContext;
import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import java.util.EnumSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * IYS Api Deamon to start the IYS service. In this main class, two inner classes are defined. One of them is to return
 * action logs through save permission requests. Second one is to return the results of search permission requests.
 */
public class ApiDeamon {

	private static final String DELAY_MS = "delayMs";

	private static final String MAX_REQUESTS_PER_SEC = "maxRequestsPerSec";
	private static final String MAX_REQUEST_MS = "maxRequestMs";

	/**
	 * Logger instance.
	 */
	private final static GLogger gLogger = new GLogger(ApiDeamon.class);

	private static final String pulsarEndpoint = "pulsar://" + ApiConfig.getPulsarHostname() + ":"
			+ ApiConfig.getPulsarPort();

	private static final String pulsarAdminEndpoint = "http://" + ApiConfig.getAdminPulsarHost() + ":"
			+ ApiConfig.getAdminPulsarPort();

	private static final String IYS_PATH = "/*";
	private static final String IYS_SERVICE = "com.galaksiya.api.service";
	private static final int PORT = 9050;

	public static boolean isRunning = getRunningMode();

	private static ExecutorService executorService = Executors.newFixedThreadPool(ApiConfig.getAgentThreadCount());
	private static GlobalContext globalContext = GlobalContext.builder().build();
	private static ExecutorService responseThreadPool = Executors.newFixedThreadPool(ApiConfig.getThreadQueueSize());

	private static ServletContextHandler contextHandler;

	public static boolean getRunningMode() {
		return true;
	}

	public static void main(String args[]) {
		// here override java default uncaught exception handler with iys uncaught
		// exception handler
		Thread.setDefaultUncaughtExceptionHandler(new IysUncaughtExceptionHandler());
		addShutDownHookProcess();
		System.setProperty("org.eclipse.jetty.util.log.class", "org.eclipse.jetty.util.log.StdErrLog");
		System.setProperty("org.eclipse.jetty.LEVEL", "OFF");
		System.setProperty("org.apache.commons.logging.Log", "org.apache.commons.logging.impl.SimpleLog");
		System.setProperty("org.apache.commons.logging.simplelog.showdatetime", "true");
		System.setProperty("org.apache.commons.logging.simplelog.log.httpclient.wire", "ERROR");
		System.setProperty("org.apache.commons.logging.simplelog.log.org.apache.http", "ERROR");
		System.setProperty("org.apache.commons.logging.simplelog.log.org.apache.http.headers", "ERROR");
		System.setProperty("log4j.logger.com.streamsets.http.RequestLogger", "ERROR");
		System.setProperty("org.apache", "ERROR");

		runAgents();

		// initialize the Jetty server
		OperationLog log = gLogger.startOperation("startServer").addField("summary", "server start info")
				.addField("port", PORT).addField("redisHost", MiddlewareConfig.getRedisHost())
				.addField("redisPort", MiddlewareConfig.getRedisPort())
				.addField("redisSentinelHost", MiddlewareConfig.getRedisSentinelHost())
				.addField("redisSentinelPort", MiddlewareConfig.getRedisSentinelPort())
				.addField("redisPoolSize", MiddlewareConfig.getRedisPoolSize())
				.addField("redisTimeout", MiddlewareConfig.getRedisSocketTimeout())
				.addField("redisExpiration", MiddlewareConfig.getRedisKeyExpiration())
				.addField("keycloakRealmName", MiddlewareConfig.getKeycloakHsRealmName());
		Server server;
		try {
			QueuedThreadPool threadPool = new QueuedThreadPool();
			threadPool.setMaxThreads(ApiConfig.getJettyThreadCount());
			server = new Server(threadPool);
			// here create resource and servlet context handlers to feed service
			HandlerList handlerList = new HandlerList();
			// handlerList.addHandler(prepareResourceHandler()); // TODO: Buna gerek var mı?
			contextHandler = prepareServletContextHandler();
			contextHandler.setErrorHandler(new CustomErrorHandler());

			handlerList.addHandler(contextHandler);
			server.setHandler(handlerList);

			// assign port number
			ServerConnector serverConnector = new ServerConnector(server);
			serverConnector.setPort(PORT);
			serverConnector.setIdleTimeout(60000);
			server.addConnector(serverConnector);
			server.start();
			log.succeed();
			server.join();
		} catch (Exception e) {
			log.fail(e);
			IysTerminator.quit(EnvironmentConfiguration.getEnvironmentName());
		}
	}

	/**
	 * This methods a shut down hook process to run time, when the shutdown hook process is triggered, it first turns
	 * the value of isRunning to false so the batch-based services don't accept any request. Secondly, it waits until
	 * all submitted tasks are executed. Later, it waits until there aren't left any message unacknowledged in the agent
	 * topics of the api.
	 */
	private static void addShutDownHookProcess() {
		Runtime.getRuntime().addShutdownHook(new Thread(() -> {
			OperationLog log = gLogger.startOperation("shutdownHook").addField("summary",
					"information about shutdown hook process");
			isRunning = false;
			boolean isControlledMsgCounts = false;
			if (contextHandler != null) {
				contextHandler.shutdown();
			}

			while (!isControlledMsgCounts) {
				OperationLog log_ = gLogger.startOperation("isControlledMsgCountsAndCloseConsumerSession", Level.TRACE)
						.addField("summary", "information about shutdown hook process");
				try {
					if (controlTopicMsgCountInBacklog()) {
						isControlledMsgCounts = true;
						// here shutdown executor services used in base agent
						awaitTerminationAfterShutdown(responseThreadPool);
						// here wait until all tasks are executed by threads
						// awaitTerminationAfterShutdown(ThreadPoolServiceProvider.getExecuterService());
						if (globalContext.getCryptographerCaller().getCryptographer().hasSession()) {
							globalContext.getCryptographerCaller().getCryptographer().closeSession();
						}
						log_.succeed();
					}
				} catch (Exception e) {
					log_.fail(e);
				}
			}
			log.succeed();
		}));
	}

	/**
	 * This method checks if the all topics are empty
	 * 
	 * @return a boolean value that indicates if the all topics are empty or not. true indicates all topics are empty,
	 *         otherwise, returns false.
	 * @throws PulsarAdminException
	 */
	private static boolean controlTopicMsgCountInBacklog() throws PulsarAdminException {
		return (globalContext.getIysPulsarClient().getMsgCountInCounter("random",
				TopicNameGenerator.getInstance().getSearchBrandTopic()) == 0
				&& globalContext.getIysPulsarClient().getMsgCountInCounter("random",
						TopicNameGenerator.getInstance().getSearchTopic()) == 0
				&& globalContext.getIysPulsarClient().getMsgCountInCounter("random",
						TopicNameGenerator.getInstance().getStatusReportTopic()) == 0
				&& globalContext.getIysPulsarClient().getMsgCountInCounter("random",
						TopicNameGenerator.getInstance().getSyncTopic()) == 0);
	}

	/**
	 * This method creates pulsar topic consumers and starts api-agents.
	 */
	private static void runAgents() {
		OperationLog log = gLogger.startOperation("startAllApiSideAgent").addField("summary",
				"information about running agents");
		try {
			if (!globalContext.getCryptographerCaller().getCryptographer().hasSession()) {
				log.addField("hasSession", globalContext.getCryptographerCaller().getCryptographer().hasSession())
						.fail();
				IysTerminator.quit(EnvironmentConfiguration.getEnvironmentName());
			} else {
				// create a listener for sync response topic
				ConsumerBuilder<byte[]> syncAddConsentConsumerBuilder = new ConsumerProvider(
						PulsarInstance.getIysPulsarClient(pulsarEndpoint, pulsarAdminEndpoint,
								ApiConfig.getTopicPartitionCount()),
						TopicNameGenerator.getInstance().getSyncTopic(), Constants.PulsarUtils.SYNC_SUBSCRIPTION)
								.getPulsarConsumerBuilder();

				// create a listener for search consent topic
				ConsumerBuilder<byte[]> searchConsentConsumerBuilder = new ConsumerProvider(
						PulsarInstance.getIysPulsarClient(pulsarEndpoint, pulsarAdminEndpoint,
								ApiConfig.getTopicPartitionCount()),
						TopicNameGenerator.getInstance().getSearchTopic(), Constants.PulsarUtils.SEARCH_SUBSCRIPTION)
								.getPulsarConsumerBuilder();

				// create a listener for search brand topic
				ConsumerBuilder<byte[]> searchBrandConsumerBuilder = new ConsumerProvider(
						PulsarInstance.getIysPulsarClient(pulsarEndpoint, pulsarAdminEndpoint,
								ApiConfig.getTopicPartitionCount()),
						TopicNameGenerator.getInstance().getSearchBrandTopic(),
						Constants.PulsarUtils.SEARCH_BRAND_SUBSCRIPTION).getPulsarConsumerBuilder();

				// add jobs to executor service
				executorService.execute(() -> {
					SyncResponseAgent syncResponseAgent = new SyncResponseAgent(globalContext);
					syncResponseAgent.consumeBuilder(responseThreadPool, syncAddConsentConsumerBuilder);
					setConsumer(log, syncAddConsentConsumerBuilder, syncResponseAgent);
				});
				log.addField("agentForConsentAdding", "syncAddConsentConsumer");

				executorService.execute(() -> {
					ConsentSearcherAgent consentSearcherAgent = new ConsentSearcherAgent(
							globalContext.getCryptographerCaller(), globalContext);
					consentSearcherAgent.consumeBuilder(responseThreadPool, searchConsentConsumerBuilder);
					setConsumer(log, searchConsentConsumerBuilder, consentSearcherAgent);
				});
				log.addField("agentForConsentSearching", "searchConsentConsumer");

				executorService.execute(() -> {
					BrandSearcherAgent brandSearcherAgent = new BrandSearcherAgent(globalContext);
					brandSearcherAgent.consumeBuilder(responseThreadPool, searchBrandConsumerBuilder);
					setConsumer(log, searchBrandConsumerBuilder, brandSearcherAgent);
				});
				log.addField("agentForSearchBrands", "searchBrandConsumer").succeed();
			}
		} catch (Throwable t) {
			log.fail(t);
			IysTerminator.quit(EnvironmentConfiguration.getEnvironment());
		}
	}

	private static void setConsumer(OperationLog log, ConsumerBuilder<byte[]> syncAddConsentConsumerBuilder,
			BaseAgent syncResponseAgent) {
		Consumer<?> syncAddConsentConsumer = null;
		try {
			syncAddConsentConsumer = syncAddConsentConsumerBuilder.subscribe();
		} catch (PulsarClientException e) {
			log.addField("agent", "syncResponseAgent").fail(e);
			IysTerminator.quit(EnvironmentConfiguration.getEnvironment());
		}
		syncResponseAgent.setConsumer(syncAddConsentConsumer);
		globalContext.setConsumer(syncAddConsentConsumer);
	}

	/**
	 * ServletContextHandler manages the common ServletContext for all of the Servlets, Filters, Sessions, and etc.
	 *
	 * @return
	 */
	private static ServletContextHandler prepareServletContextHandler() {
		ServletContextHandler context = new ServletContextHandler(ServletContextHandler.NO_SESSIONS);
		context.setContextPath("/");
		ServletHolder servletHolder = context.addServlet(ServletContainer.class, IYS_PATH);

		servletHolder.setInitOrder(1);
		servletHolder.setInitParameter(Constants.JerseyConfig.JERSEY_CONFIG_SERVER_PROVIDER_PACKAGES, IYS_SERVICE);
		// create global context
		context.addEventListener(prepareContextListener());

		addRateLimitToPaths(context);
		return context;
	}

	/**
	 * This method adds rate limit to the service paths.
	 *
	 * @param context
	 */
	private static void addRateLimitToPaths(ServletContextHandler context) {
		// add filters
		EnumSet<DispatcherType> SCOPE = EnumSet.of(DispatcherType.REQUEST);

		// create a request limit provider
		FilterHolder holder = new FilterHolder(DoSFilter.class);
		holder.setInitParameter(MAX_REQUESTS_PER_SEC, String.valueOf(ApiConfig.getRateLimit()));
		holder.setInitParameter(MAX_REQUEST_MS, "60000");
		holder.setInitParameter(DELAY_MS, "-1"); // "-1" to reject excess request
		context.addFilter(holder, "/consent/*", SCOPE);
		context.addFilter(holder, "/kv/*", SCOPE);
		context.addFilter(holder, "/oauth/*", SCOPE);
		context.addFilter(holder, "/report/*", SCOPE);
		context.addFilter(holder, "/sp/*", SCOPE);
		context.addFilter(holder, "/retailers/*", SCOPE);
		context.addFilter(holder, "/brands/*", SCOPE);
		context.addFilter(holder, "/sps/*", SCOPE);
		context.addFilter(holder, "/recipients/*", SCOPE);
		context.addFilter(holder, "/integrator/*", SCOPE);
		context.addFilter(holder, "/public/*", SCOPE);
		context.addFilter(holder, "/government/*", SCOPE);

	}

	/**
	 * This method adds global context
	 *
	 * @return
	 */
	private static ServletContextListener prepareContextListener() {
		return new ServletContextListener() {
			@Override
			public void contextInitialized(ServletContextEvent sce) {
				ServletContext context = sce.getServletContext();
				context.setAttribute(Constants.GLOBAL_CONTEXT, globalContext);
			}

			@Override
			public void contextDestroyed(ServletContextEvent sce) {

			}
		};

	}

	/**
	 * Here shutdown executor service, after processing all tasks in the progress.
	 * 
	 * @param executorService
	 */
	public static void awaitTerminationAfterShutdown(ExecutorService executorService) {
		executorService.shutdown();
		try {
			if (!executorService.awaitTermination(60, TimeUnit.SECONDS)) {
				executorService.shutdownNow();
			}
		} catch (InterruptedException ex) {
			gLogger.startOperation("awaitTerminationAfterShutdown").fail(ex);
			executorService.shutdownNow();
			Thread.currentThread().interrupt();
		}
	}
}
