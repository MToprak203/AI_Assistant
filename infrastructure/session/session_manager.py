# infrastructure/session/session_manager.py
from typing import Dict, Any
import uuid
import threading
import time


class SessionManager:
    """Manages user sessions and their associated conversation use cases"""

    def __init__(self, session_timeout=3600):  # Default timeout: 1 hour
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.session_timestamps: Dict[str, float] = {}  # Track last activity time
        self.session_timeout = session_timeout
        self.lock = threading.Lock()  # Thread safety

        # Start a cleanup thread
        self._start_cleanup_thread()

    def create_session(self) -> str:
        """Create a new session and return session ID"""
        with self.lock:
            session_id = str(uuid.uuid4())
            self.sessions[session_id] = {
                'conversation_uc': None,
                'model': None,
                'tokenizer': None,
                'created_at': time.time()
            }
            self.session_timestamps[session_id] = time.time()
            return session_id

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """Get session data by ID and update last activity timestamp"""
        with self.lock:
            if session_id in self.sessions:
                # Update last activity timestamp
                self.session_timestamps[session_id] = time.time()
                return self.sessions.get(session_id)
            return None

    def set_session_data(self, session_id: str, key: str, value: Any):
        """Set data for a specific session"""
        with self.lock:
            if session_id in self.sessions:
                self.sessions[session_id][key] = value
                # Update last activity timestamp
                self.session_timestamps[session_id] = time.time()

    def delete_session(self, session_id: str):
        """Delete a session"""
        with self.lock:
            if session_id in self.sessions:
                del self.sessions[session_id]
                if session_id in self.session_timestamps:
                    del self.session_timestamps[session_id]

    def touch_session(self, session_id: str):
        """Update the last activity timestamp for a session"""
        with self.lock:
            if session_id in self.sessions:
                self.session_timestamps[session_id] = time.time()
                return True
            return False

    def _cleanup_expired_sessions(self):
        """Remove expired sessions"""
        current_time = time.time()
        expired_sessions = []

        with self.lock:
            for session_id, last_activity in self.session_timestamps.items():
                if current_time - last_activity > self.session_timeout:
                    expired_sessions.append(session_id)

            for session_id in expired_sessions:
                print(f"Removing expired session: {session_id}")
                if session_id in self.sessions:
                    del self.sessions[session_id]
                if session_id in self.session_timestamps:
                    del self.session_timestamps[session_id]

    def _start_cleanup_thread(self):
        """Start a thread to periodically clean up expired sessions"""

        def cleanup_task():
            while True:
                try:
                    # Run cleanup every 5 minutes
                    time.sleep(300)
                    self._cleanup_expired_sessions()
                except Exception as e:
                    print(f"Error in session cleanup: {str(e)}")

        cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
        cleanup_thread.start()