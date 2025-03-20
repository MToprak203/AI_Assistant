# infrastructure/di/container.py
from dependency_injector import containers, providers

from application.use_cases.conversation import ConversationUseCase
from core.domain.models import AnalysisConfig
from infrastructure.adapters.chat_output.cli_adapter import CLIChatAdapter
from infrastructure.adapters.file_handlers.local_file_adapter import LocalFileAdapter
from infrastructure.adapters.model_loaders.huggingface_adapter import HuggingFaceModelAdapter
from infrastructure.adapters.prompt_builders.conversation_adapter import ConversationPromptAdapter
from infrastructure.adapters.response_generators.streaming_adapter import StreamingResponseAdapter


# infrastructure/di/container.py
class Container(containers.DeclarativeContainer):
    config = providers.Configuration()

    analysis_config = providers.Factory(
        AnalysisConfig,
        max_history_length=config.max_history_length,
        default_temp=config.default_temp
    )

    # Adapters
    model_loader = providers.Factory(HuggingFaceModelAdapter)
    file_handler = providers.Factory(LocalFileAdapter)
    prompt_builder = providers.Factory(ConversationPromptAdapter)
    response_generator = providers.Factory(StreamingResponseAdapter)
    chat_output = providers.Factory(CLIChatAdapter)

    # Use Cases
    conversation_uc = providers.Factory(
        ConversationUseCase,
        output_port=chat_output,
        response_generator=response_generator,
        prompt_builder=prompt_builder,
        config=analysis_config
    )