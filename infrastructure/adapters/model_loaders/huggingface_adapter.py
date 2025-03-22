# infrastructure/adapters/model_loaders/huggingface_adapter.py
from core.ports.model_loader_port import ModelLoaderPort
from infrastructure.adapters.model_loaders.model_manager import ModelManager


class HuggingFaceModelAdapter(ModelLoaderPort):
    def __init__(self, model_name: str = "deepseek-ai/deepseek-coder-6.7b-instruct"):
        self.model_name = model_name
        self.model_manager = ModelManager()

    def load_model_and_tokenizer(self):
        """
        Get the model and tokenizer from the model manager.
        If the model manager is not initialized, initialize it first.
        """
        if not self.model_manager.is_initialized():
            self.model_manager.initialize(self.model_name)

        return self.model_manager.get_model_and_tokenizer()