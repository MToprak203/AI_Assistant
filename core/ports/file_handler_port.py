# core/ports/file_handler_port.py
from abc import ABC, abstractmethod

class FileHandlerPort(ABC):
    @abstractmethod
    def read_file(self, path: str) -> str:
        pass