# entrypoints/web.py
import os
import threading
from pathlib import Path

from flask import Flask, request, jsonify, render_template, send_from_directory, session as flask_session
from flask_socketio import SocketIO, emit, join_room

from infrastructure.adapters.chat_output.web_adapter import WebChatAdapter
from infrastructure.adapters.file_handlers.web_file_adapter import WebFileAdapter
from infrastructure.di.container import Container
from infrastructure.session.session_manager import SessionManager


class WebApp:
    """Web application for the code assistant."""

    def __init__(self):
        # Get the absolute path to the root directory
        self.root_dir = Path(__file__).parent.parent
        self.static_dir = self.root_dir / 'frontend/static'
        self.template_dir = self.root_dir / 'frontend/template'
        self.upload_dir = self.root_dir / 'uploads'

        # Create uploads directory if it doesn't exist
        os.makedirs(self.upload_dir, exist_ok=True)

        # Initialize Flask and SocketIO
        self.app = Flask(__name__,
                         static_folder=str(self.static_dir),
                         template_folder=str(self.template_dir))

        self.app.config['SECRET_KEY'] = os.urandom(24)
        self.app.config['UPLOAD_FOLDER'] = str(self.upload_dir)
        self.app.config['SESSION_TYPE'] = 'filesystem'
        self.app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # Session lifetime in seconds (1 hour)

        self.socketio = SocketIO(self.app, cors_allowed_origins="*", manage_session=False)

        # Set up DI container
        self.container = Container()
        self.container.config.from_dict({
            "context": "web",
            "max_history_length": 10,
            "default_temp": 0.7,
            "model_name": "deepseek-ai/deepseek-coder-6.7b-instruct"
        })
        self.container.socketio.override(self.socketio)

        # Get references to managers and adapters from container
        self.file_adapter = WebFileAdapter(upload_folder=self.app.config['UPLOAD_FOLDER'])
        self.chat_adapter = WebChatAdapter(self.socketio)
        self.session_manager = SessionManager()
        self.model_manager = self.container.model_manager()

        # Register routes and socket events
        self._register_routes()
        self._register_socket_events()

    def _register_routes(self):
        """Register all HTTP routes."""

        @self.app.route('/')
        def index():
            """Render the main chat interface."""
            return render_template('index.html')

        @self.app.route('/<path:filename>')
        def serve_static(filename):
            """Serve static files."""
            return send_from_directory(self.app.static_folder, filename)

        @self.app.route('/api/sessions', methods=['POST'])
        def create_session():
            """Create a new chat session."""
            try:
                # Ensure model is loaded
                if not self.model_manager.is_initialized():
                    self.model_manager.initialize(self.container.config.model_name())

                # Get model and tokenizer
                model, tokenizer = self.model_manager.get_model_and_tokenizer()

                # Create new session
                session_id = self.session_manager.create_session()

                # Store session ID in Flask session
                flask_session['chat_session_id'] = session_id

                # Create a new conversation use case for this session
                conversation_uc = self.container.conversation_uc(
                    output_port=self.chat_adapter
                )

                # Set the model and tokenizer directly
                conversation_uc.set_model_and_tokenizer(model, tokenizer)

                # Store in session manager
                self.session_manager.set_session_data(session_id, 'conversation_uc', conversation_uc)

                return jsonify({'session_id': session_id})
            except Exception as e:
                self.app.logger.error(f"Error creating session: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/upload', methods=['POST'])
        def upload_file():
            """Handle file uploads."""
            if 'file' not in request.files:
                return jsonify({'error': 'No file part'}), 400

            file = request.files['file']

            if file.filename == '':
                return jsonify({'error': 'No selected file'}), 400

            try:
                # Get current session ID from the Flask session
                session_id = flask_session.get('chat_session_id')
                print(f"Processing file upload for session: {session_id}")

                # Save the file
                file_path = self.file_adapter.save_uploaded_file(file, session_id)

                # Return file info along with session ID
                return jsonify({
                    'file_path': file_path,
                    'filename': os.path.basename(file_path),
                    'session_id': session_id
                })
            except Exception as e:
                self.app.logger.error(f"Error uploading file: {str(e)}")
                return jsonify({'error': str(e)}), 500

    def _register_socket_events(self):
        """Register socket.io event handlers."""

        @self.socketio.on('connect')
        def handle_connect():
            """Handle client connection."""
            print('Client connected')

        @self.socketio.on('join_session')
        def handle_join_session(data):
            """Join a specific chat session room."""
            session_id = data.get('session_id')

            if session_id and self.session_manager.get_session(session_id):
                join_room(session_id)
                # Store the session ID in the Flask session
                flask_session['chat_session_id'] = session_id
                emit('session_joined', {'status': 'success'})
            else:
                emit('session_joined', {'status': 'error', 'message': 'Invalid session'})

        @self.socketio.on('user_message')
        def handle_message(data):
            """Handle incoming user message."""
            print(f"Received message: {data}")
            session_id = data.get('session_id')
            message = data.get('message')
            file_path = data.get('file_path')

            if not session_id or not message:
                print("Invalid request parameters")
                emit('error', {'message': 'Invalid request parameters'})
                return

            session_data = self.session_manager.get_session(session_id)
            if not session_data:
                print(f"Invalid session: {session_id}")
                emit('error', {'message': 'Invalid session'})
                return

            print(f"Session data: {session_data.keys()}")
            conversation_uc = session_data['conversation_uc']

            # Process file if provided
            code_content = None
            if file_path:
                try:
                    print(f"Reading file: {file_path}")
                    code_content = self.file_adapter.read_file(file_path)
                except Exception as e:
                    print(f"Error reading file: {str(e)}")
                    emit('error', {'message': f'Error reading file: {str(e)}'})
                    return

            # Emit message receipt acknowledgment
            print("Emitting processing status")
            emit('message_received', {'status': 'processing'})

            # Process in a separate thread to not block the server
            self._process_message_async(session_id, conversation_uc, message, code_content)

    def _process_message_async(self, session_id, conversation_uc, message, code_content):
        """Process the message in a separate thread."""

        def process_task():
            try:
                print("Starting model processing")

                # Set the current room in the chat adapter for streaming
                web_chat_adapter = conversation_uc.output_port
                web_chat_adapter.set_current_room(session_id)

                # Set the output adapter in the response generator for streaming
                response_generator = conversation_uc.response_generator
                if hasattr(response_generator, 'set_output_adapter'):
                    response_generator.set_output_adapter(web_chat_adapter)

                # Generate response
                full_response = conversation_uc.handle_message(message, code_content)

                # Store the full response in the session history
                print(f"Full response generated, length: {len(full_response)}")

                # Signal completion to the client
                self.socketio.emit('assistant_response_complete',
                                   {'status': 'complete'},
                                   room=session_id)

                print("Response sent to client")

            except Exception as e:
                print(f"Error generating response: {str(e)}")
                import traceback
                traceback.print_exc()
                self.socketio.emit('error',
                                   {'message': f'Error generating response: {str(e)}'},
                                   room=session_id)

        thread = threading.Thread(target=process_task)
        thread.daemon = True
        thread.start()
        print(f"Started processing thread {thread.name}")

    def run(self, debug=True, host='0.0.0.0', port=5000):
        """Run the application."""
        print("Starting server - model will be loaded when first request is received")
        self.socketio.run(self.app, debug=debug, host=host, port=port)


def create_app():
    """Factory function to create and initialize the application."""
    web_app = WebApp()
    return web_app.app, web_app.socketio, web_app


if __name__ == '__main__':
    app, socketio, web_app = create_app()
    web_app.run(debug=True)