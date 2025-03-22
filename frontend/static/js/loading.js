// frontend/static/js/loading.js

/**
 * Loading page script to handle connection and initialization sequence
 */
const LoadingPage = (function() {
    // DOM Elements
    const serverConnectionIcon = document.getElementById('server-connection-icon');
    const serverConnectionStatus = document.getElementById('server-connection-status');
    const sessionIcon = document.getElementById('session-icon');
    const sessionStatus = document.getElementById('session-status');
    const modelIcon = document.getElementById('model-icon');
    const modelStatus = document.getElementById('model-status');
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');
    const retryButton = document.getElementById('retry-button');

    // Socket instance
    let socket = null;

    // Timeout values
    const CONNECTION_TIMEOUT = 10000; // 10 seconds
    const SESSION_TIMEOUT = 15000;    // 15 seconds
    const MODEL_TIMEOUT = 60000;      // 60 seconds

    // Timeout IDs
    let connectionTimeoutId = null;
    let sessionTimeoutId = null;
    let modelTimeoutId = null;
    let maxReconnectAttempts = 3;
    let reconnectAttempts = 0;

    /**
     * Initialize the loading sequence
     */
    const init = function() {
        console.log("Starting loading sequence");

        // Set up retry button
        retryButton.addEventListener('click', retry);

        // Start connection process
        connectToServer();
    };

    /**
     * Connect to the Socket.IO server
     */
    const connectToServer = function() {
        updateStatus('connection', 'connecting');

        // Clear any existing socket
        if (socket) {
            socket.disconnect();
            socket = null;
        }

        // Create new socket connection
        socket = io();

        // Set connection timeout
        connectionTimeoutId = setTimeout(() => {
            if (reconnectAttempts < maxReconnectAttempts) {
                console.log(`Connection timeout, retrying (${reconnectAttempts + 1}/${maxReconnectAttempts})...`);
                reconnectAttempts++;
                connectToServer();
            } else {
                handleError('Server connection timed out. Please refresh the page to try again.');
            }
        }, CONNECTION_TIMEOUT);

        // Connection event handlers
        socket.on('connect', () => {
            clearTimeout(connectionTimeoutId);
            console.log('Connected to server successfully');
            updateStatus('connection', 'success');
            createSession();
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Connection error, retrying (${reconnectAttempts}/${maxReconnectAttempts})...`);
            } else {
                clearTimeout(connectionTimeoutId);
                handleError(`Failed to connect to server: ${error.message}`);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            updateStatus('connection', 'error');
            handleError('Connection to server lost. Please try refreshing the page.');
        });

        // Listen for session joined event
        socket.on('session_joined', (data) => {
            clearTimeout(sessionTimeoutId);

            if (data.status === 'success') {
                console.log('Session joined successfully');
                updateStatus('session', 'success');
                checkModelStatus();
            } else {
                console.error('Failed to join session:', data.message);
                updateStatus('session', 'error');
                handleError(`Failed to join session: ${data.message}`);
            }
        });

        // Listen for model initialization event
        socket.on('model_initialized', (data) => {
            clearTimeout(modelTimeoutId);

            if (data.status === 'success') {
                console.log('AI model initialized successfully');
                updateStatus('model', 'success');
                // Add fade-out animation before redirecting
                const mainContainer = document.querySelector('main');
                if (mainContainer) {
                    mainContainer.classList.add('fade-out');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 800); // Matches the CSS transition duration
                } else {
                    // Fallback if container not found
                    window.location.href = '/';
                }
            } else {
                console.error('Failed to initialize model:', data.message);
                updateStatus('model', 'error');
                handleError(`Failed to initialize AI model: ${data.message}`);
            }
        });

        // Listen for model status event
        socket.on('model_status', (data) => {
            if (data.status === 'loading') {
                updateStatus('model', 'loading', data.message || 'Loading AI model...');
            } else if (data.status === 'success') {
                updateStatus('model', 'success');
                // Add fade-out animation before redirecting
                const mainContainer = document.querySelector('main');
                if (mainContainer) {
                    mainContainer.classList.add('fade-out');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 800); // Matches the CSS transition duration
                } else {
                    // Fallback if container not found
                    window.location.href = '/';
                }
            }
        });

        // Listen for errors
        socket.on('error', (data) => {
            console.error('Server error:', data);
            handleError(data.message || 'An error occurred during initialization.');
        });

        // Listen for maximum reconnect attempts reached
        socket.on('maxReconnectAttemptsReached', () => {
            handleError('Lost connection to server. Please refresh the page.');
        });
    };

    /**
     * Create a new session
     */
    const createSession = function() {
        updateStatus('session', 'loading');

        // Set session timeout
        sessionTimeoutId = setTimeout(() => {
            updateStatus('session', 'error');
            handleError('Session initialization timed out. Please try again.');
        }, SESSION_TIMEOUT);

        // Call session creation API
        fetch('/api/sessions', {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Session created:', data);
            if (data.session_id) {
                // Join the session room
                socket.emit('join_session', { session_id: data.session_id });
            } else {
                throw new Error('Invalid session data received');
            }
        })
        .catch(error => {
            console.error('Error creating session:', error);
            clearTimeout(sessionTimeoutId);
            updateStatus('session', 'error');
            handleError(`Failed to create session: ${error.message}`);
        });
    };

    /**
     * Check model initialization status
     */
    const checkModelStatus = function() {
        updateStatus('model', 'loading');

        // Set model timeout
        modelTimeoutId = setTimeout(() => {
            updateStatus('model', 'error');
            handleError('Model initialization timed out. The server might be under heavy load.');
        }, MODEL_TIMEOUT);

        // We don't need to do anything here as the model status will be pushed via socket
        // The server will send 'model_initialized' or 'model_status' events
    };

    /**
     * Update status display for a specific step
     * @param {string} step - The step to update ('connection', 'session', 'model')
     * @param {string} status - The status ('connecting', 'loading', 'success', 'error')
     * @param {string} [message] - Optional status message
     */
    const updateStatus = function(step, status, message) {
        let icon, statusElement, bgColor, textColor, svgColor;

        // Select the correct elements based on step
        if (step === 'connection') {
            icon = serverConnectionIcon;
            statusElement = serverConnectionStatus;
        } else if (step === 'session') {
            icon = sessionIcon;
            statusElement = sessionStatus;
        } else if (step === 'model') {
            icon = modelIcon;
            statusElement = modelStatus;
        }

        // Update status message
        if (message) {
            statusElement.textContent = message;
        } else {
            switch (status) {
                case 'connecting':
                    statusElement.textContent = 'Connecting to server...';
                    break;
                case 'loading':
                    statusElement.textContent = step === 'session' ? 'Creating session...' : 'Loading AI model...';
                    break;
                case 'success':
                    statusElement.textContent = step === 'connection' ? 'Connected to server' :
                                                (step === 'session' ? 'Session initialized' : 'AI model ready');
                    break;
                case 'error':
                    statusElement.textContent = step === 'connection' ? 'Connection failed' :
                                                (step === 'session' ? 'Session initialization failed' : 'Model loading failed');
                    break;
            }
        }

        // Update icon appearance
        switch (status) {
            case 'connecting':
            case 'loading':
                bgColor = 'bg-blue-100';
                textColor = 'text-blue-500';
                svgColor = 'text-blue-500';
                // Add loading spinner
                icon.innerHTML = '<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
                break;
            case 'success':
                bgColor = 'bg-green-100';
                textColor = 'text-green-500';
                svgColor = 'text-green-500';
                // Add success icon
                icon.innerHTML = '<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>';
                break;
            case 'error':
                bgColor = 'bg-red-100';
                textColor = 'text-red-500';
                svgColor = 'text-red-500';
                // Add error icon
                icon.innerHTML = '<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>';
                break;
        }

        // Update classes
        icon.className = `flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full ${bgColor} ${svgColor}`;
        statusElement.className = `text-sm ${textColor}`;
    };

    /**
     * Handle errors
     * @param {string} message - Error message to display
     */
    const handleError = function(message) {
        errorMessage.textContent = message;
        errorContainer.classList.remove('hidden');
    };

    /**
     * Retry the connection and initialization process
     */
    const retry = function() {
        console.log('Retrying connection...');

        // Reset error UI
        errorContainer.classList.add('hidden');

        // Reset status
        updateStatus('connection', 'connecting');
        updateStatus('session', 'waiting', 'Waiting for connection...');
        updateStatus('model', 'waiting', 'Waiting for session...');

        // Reset reconnect attempts
        reconnectAttempts = 0;

        // Restart connection process
        connectToServer();
    };

    // Initialize on document load
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        retry: retry
    };
})();