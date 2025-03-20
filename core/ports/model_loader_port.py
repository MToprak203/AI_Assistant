# core/ports/model_loader_port.py
from abc import ABC, abstractmethod
from transformers import AutoModelForCausalLM, AutoTokenizer


class ModelLoaderPort(ABC):
    @abstractmethod
    def load_model(self) -> AutoModelForCausalLM:
        pass

    @abstractmethod
    def load_tokenizer(self) -> AutoTokenizer:
        pass