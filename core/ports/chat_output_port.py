# core/ports/chat_output_port.py
from abc import ABC, abstractmethod

class ChatOutputPort(ABC):
    @abstractmethod
    def display_message(self, message: str):
        pass

    @abstractmethod
    def get_user_input(self, prompt: str) -> str:
        pass