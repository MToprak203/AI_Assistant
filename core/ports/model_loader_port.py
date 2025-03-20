# core/ports/model_loader_port.py
from abc import ABC, abstractmethod
from transformers import AutoModelForCausalLM, AutoTokenizer
from typing import Tuple

class ModelLoaderPort(ABC):
    @abstractmethod
    def load_model_and_tokenizer(self) -> Tuple[AutoModelForCausalLM, AutoTokenizer]:
        pass