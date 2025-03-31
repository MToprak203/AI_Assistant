# core/domain/models.py
from dataclasses import dataclass
from typing import Optional


@dataclass
class ChatMessage:
    role: str
    content: str


@dataclass
class ProjectFile:
    filename: str
    content: str
    description: Optional[str] = None


@dataclass
class AnalysisConfig:
    max_history_length: int = 10
    default_temp: float = 0.7
    max_project_context_tokens: int = 6000
    max_files_per_message: int = 3