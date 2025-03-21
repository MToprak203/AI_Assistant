# infrastructure/adapters/chat_output/web_adapter.py
from core.ports.chat_output_port import ChatOutputPort
from flask import jsonify, session
from flask_socketio import emit


class WebChatAdapter(ChatOutputPort):
    def __init__(self, socketio):
        self.socketio = socketio
        self.current_room = None
        self.session_messages = {}  # Store messages by session ID

    def display_message(self, message: str, room=None):
        """Send message to client via Socket.IO"""
        target_room = room or self.current_room
        self.socketio.emit('assistant_response', {'content': message, 'complete': True}, room=target_room)

        # Store in session messages
        if target_room:
            self.session_messages[target_room] = message

        return message

    def stream_chunk(self, chunk: str, room=None):
        """Stream a chunk of the response to the client"""
        target_room = room or self.current_room
        if target_room:
            # Add to session message for this room
            self.session_messages.setdefault(target_room, "")
            self.session_messages[target_room] += chunk

            # Send chunk to client
            self.socketio.emit('assistant_chunk', {'content': chunk}, room=target_room)

    def set_current_room(self, room_id):
        """Set the current room for streaming chunks"""
        self.current_room = room_id
        # Initialize or reset session message for this room
        self.session_messages[room_id] = ""

    def get_full_message(self, room=None):
        """Get the full aggregated message for the specified room"""
        target_room = room or self.current_room
        return self.session_messages.get(target_room, "")

    def get_user_input(self, prompt: str) -> str:
        """
        This method is not used in web context since inputs come from HTTP requests
        or WebSocket events rather than being requested directly
        """
        raise NotImplementedError("This method is not applicable for web contexts")