# infrastructure/di/container.py
from dependency_injector import containers, providers

from application.use_cases.conversation import ConversationUseCase
from core.domain.models import AnalysisConfig
from infrastructure.adapters.chat_output.cli_adapter import CLIChatAdapter
from infrastructure.adapters.chat_output.web_adapter import WebChatAdapter
from infrastructure.adapters.file_handlers.local_file_adapter import LocalFileAdapter
from infrastructure.adapters.file_handlers.web_file_adapter import WebFileAdapter
from infrastructure.adapters.model_loaders.huggingface_adapter import HuggingFaceModelAdapter
from infrastructure.adapters.prompt_builders.conversation_adapter import ModelAwarePromptAdapter
from infrastructure.adapters.response_generators.streaming_adapter import StreamingResponseAdapter


class Container(containers.DeclarativeContainer):
    config = providers.Configuration()

    # Optional dependencies
    socketio = providers.Dependency(instance_of=object)

    analysis_config = providers.Factory(
        AnalysisConfig,
        max_history_length=config.max_history_length,
        default_temp=config.default_temp
    )

    # Adapters
    model_loader = providers.Factory(
        HuggingFaceModelAdapter,
        model_name=config.model_name
    )

    file_handler = providers.Selector(
        config.context,
        cli=providers.Factory(LocalFileAdapter),
        web=providers.Factory(WebFileAdapter)
    )

    prompt_builder = providers.Factory(ModelAwarePromptAdapter)
    response_generator = providers.Factory(StreamingResponseAdapter)

    chat_output = providers.Selector(
        config.context,
        cli=providers.Factory(CLIChatAdapter),
        web=providers.Factory(WebChatAdapter, socketio=socketio)
    )

    # Use Cases
    conversation_uc = providers.Factory(
        ConversationUseCase,
        output_port=chat_output,
        response_generator=response_generator,
        prompt_builder=prompt_builder,
        config=analysis_config
    )