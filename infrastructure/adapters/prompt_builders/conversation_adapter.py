# infrastructure/adapters/prompt_builders/conversation_adapter.py
from core.ports.prompt_builder_port import PromptBuilderPort
from core.domain.models import ChatMessage
from typing import List
from transformers import AutoTokenizer


class ModelAwarePromptAdapter(PromptBuilderPort):
    def build_prompt(self, history: List[ChatMessage], tokenizer: AutoTokenizer) -> str:
        # Convert ChatMessage objects to standard message format
        messages = [{"role": msg.role, "content": msg.content} for msg in history]

        # Use the tokenizer's built-in chat template if available
        if tokenizer.chat_template is not None:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True
            )

        # Fallback for models without chat template
        return self._build_fallback_prompt(messages)

    def _build_fallback_prompt(self, messages: list) -> str:
        prompt = ""
        for msg in messages:
            prompt += f"{msg['role'].capitalize()}: {msg['content']}\n"
        return prompt + "Assistant: "