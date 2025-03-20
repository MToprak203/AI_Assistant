# core/domain/models.py
from dataclasses import dataclass

@dataclass
class ChatMessage:
    role: str
    content: str

@dataclass
class AnalysisConfig:
    max_history_length: int = 10
    default_temp: float = 0.7