# infrastructure/adapters/prompt_builders/conversation_adapter.py
from core.ports.prompt_builder_port import PromptBuilderPort
from core.domain.models import ChatMessage
from typing import List

class ConversationPromptAdapter(PromptBuilderPort):
    def build_prompt(self, history: List[ChatMessage]) -> str:
        prompt = ""
        for turn in history:
            if turn.role == "user":
                prompt += f"User: {turn.content}\n"
            else:
                prompt += f"Assistant: {turn.content}\n"
        return prompt + "Assistant: "