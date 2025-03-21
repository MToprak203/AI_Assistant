# infrastructure/adapters/chat_output/web_adapter.py
from core.ports.chat_output_port import ChatOutputPort
from flask import jsonify, session
from flask_socketio import emit


class WebChatAdapter(ChatOutputPort):
    def __init__(self, socketio):
        self.socketio = socketio

    def display_message(self, message: str, room=None):
        """Send message to client via Socket.IO"""
        self.socketio.emit('assistant_response', {'content': message}, room=room)
        return message

    def get_user_input(self, prompt: str) -> str:
        """
        This method is not used in web context since inputs come from HTTP requests
        or WebSocket events rather than being requested directly
        """
        raise NotImplementedError("This method is not applicable for web contexts")