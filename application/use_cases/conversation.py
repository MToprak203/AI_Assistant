# application/use_cases/conversation.py
from core.domain.models import ChatMessage, AnalysisConfig
from typing import List, Optional


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

        # Connect the response generator to the output port if possible
        if hasattr(self.response_generator, 'set_output_adapter'):
            self.response_generator.set_output_adapter(self.output_port)

    def initialize_with_code(self, code: str, task: str = "Refactor according to SOLID principles"):
        """Initialize conversation with code content"""
        initial_message = ChatMessage(
            role="user",
            content=f"{task}:\n```java\n{code}\n```\n"
        )
        self._add_to_history(initial_message)
        return initial_message

    def handle_message(self, user_message: str, code_file: Optional[str] = None, model_loader=None) -> str:
        """Handle a single message from the user and return the assistant response"""
        if code_file:
            # If code is provided, add context about the code
            message_with_code = f"{user_message}\n\nHere's the code I'm working with:\n```\n{code_file}\n```"
            self._add_to_history(ChatMessage(role="user", content=message_with_code))
        else:
            self._add_to_history(ChatMessage(role="user", content=user_message))

        # Load model if not provided
        if not hasattr(self, 'model') or not hasattr(self, 'tokenizer'):
            if model_loader:
                self.model, self.tokenizer = model_loader.load_model_and_tokenizer()
            else:
                raise ValueError("Model loader must be provided on first call")

        # Build prompt and generate response
        prompt = self.prompt_builder.build_prompt(self.history, self.tokenizer)

        # Make sure response generator has output adapter before generating
        if hasattr(self.response_generator, 'set_output_adapter'):
            self.response_generator.set_output_adapter(self.output_port)

        # Generate the response (this will stream chunks if a streaming adapter is used)
        response = self.response_generator.generate_response(
            prompt,
            self.model,
            self.tokenizer
        )

        # Add the complete response to history
        self._add_to_history(ChatMessage(role="assistant", content=response))

        # Return the complete response (important for history)
        return response

    def get_history(self):
        """Return conversation history"""
        return self.history

    def _add_to_history(self, message: ChatMessage):
        """Add a message to the conversation history, maintaining max length"""
        if len(self.history) >= self.config.max_history_length:
            self.history.pop(0)
        self.history.append(message)