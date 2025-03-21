# infrastructure/session/session_manager.py
from typing import Dict, Any
import uuid


class SessionManager:
    """Manages user sessions and their associated conversation use cases"""

    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(self) -> str:
        """Create a new session and return session ID"""
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            'conversation_uc': None,
            'model': None,
            'tokenizer': None
        }
        return session_id

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """Get session data by ID"""
        return self.sessions.get(session_id)

    def set_session_data(self, session_id: str, key: str, value: Any):
        """Set data for a specific session"""
        if session_id in self.sessions:
            self.sessions[session_id][key] = value

    def delete_session(self, session_id: str):
        """Delete a session"""
        if session_id in self.sessions:
            del self.sessions[session_id]