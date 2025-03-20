# infrastructure/adapters/chat_output/cli_adapter.py
from core.ports.chat_output_port import ChatOutputPort


class CLIChatAdapter(ChatOutputPort):
    def display_message(self, message: str):
        print(message)

    def get_user_input(self, prompt: str) -> str:
        return input(prompt)