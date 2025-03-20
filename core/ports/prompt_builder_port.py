# core/ports/prompt_builder_port.py
from abc import ABC, abstractmethod
from typing import List
from core.domain.models import ChatMessage

class PromptBuilderPort(ABC):
    @abstractmethod
    def build_prompt(self, history: List[ChatMessage]) -> str:
        pass