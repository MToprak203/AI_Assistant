# core/ports/response_generator_port.py
from abc import ABC, abstractmethod
from transformers import AutoModelForCausalLM, AutoTokenizer

class ResponseGeneratorPort(ABC):
    @abstractmethod
    def generate_response(self, prompt: str, model: AutoModelForCausalLM, tokenizer: AutoTokenizer) -> str:
        pass