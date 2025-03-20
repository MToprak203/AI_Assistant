# application/use_cases/conversation.py
from core.domain.models import ChatMessage, AnalysisConfig
from typing import List, Generator


class ConversationUseCase:
    def __init__(self,
                 output_port,
                 response_generator,
                 prompt_builder,
                 config: AnalysisConfig):
        self.output_port = output_port
        self.response_generator = response_generator
        self.prompt_builder = prompt_builder
        self.config = config
        self.history: List[ChatMessage] = []

    def initialize_with_code(self, code: str):
        """Initialize conversation with code content"""
        initial_message = ChatMessage(
            role="user",
            content=f"Refactor the following Java code according to SOLID principles:\n```java\n{code}\n```\n"
                    f"Write only the refactored code without explanations."
        )
        self._add_to_history(initial_message)

    def handle_conversation(self, model, tokenizer):
        while True:
            try:
                prompt = self.prompt_builder.build_prompt(self.history)

                # Directly use the response generator's streaming
                full_response = self.response_generator.generate_response(
                    prompt,
                    model,
                    tokenizer
                )

                self._add_to_history(ChatMessage(
                    role="assistant",
                    content=full_response
                ))

                user_input = self.output_port.get_user_input("\nUser: ")
                if user_input.lower() in ["exit", "quit"]:
                    break

                self._add_to_history(ChatMessage(role="user", content=user_input))

            except KeyboardInterrupt:
                break

    def _add_to_history(self, message: ChatMessage):
        if len(self.history) >= self.config.max_history_length:
            self.history.pop(0)
        self.history.append(message)