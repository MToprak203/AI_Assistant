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

# Get the absolute path to the root directory
ROOT_DIR = Path(__file__).parent.parent
STATIC_DIR = ROOT_DIR / 'frontend/static'
TEMPLATE_DIR = ROOT_DIR / 'frontend/template'
UPLOAD_DIR = ROOT_DIR / 'uploads'

app = Flask(__name__,
            static_folder=str(STATIC_DIR),
            template_folder=str(TEMPLATE_DIR))

app.config['SECRET_KEY'] = os.urandom(24)
app.config['UPLOAD_FOLDER'] = str(UPLOAD_DIR)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # Session lifetime in seconds (1 hour)

# Initialize socketio with CORS
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)

# Set up DI container
container = Container()
container.config.from_dict({
    "context": "web",  # This was missing - needed to select correct adapters
    "max_history_length": 10,
    "default_temp": 0.7,
    "model_name": "deepseek-ai/deepseek-coder-6.7b-instruct"
})

# Set the socketio instance in the container
container.socketio.override(socketio)

# Create session manager
session_manager = SessionManager()

# Configure web-specific adapters
web_file_adapter = WebFileAdapter(upload_folder=app.config['UPLOAD_FOLDER'])
web_chat_adapter = WebChatAdapter(socketio)


@app.route('/')
def index():
    """Render the main chat interface"""
    return render_template('index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory(app.static_folder, filename)


@app.route('/api/sessions', methods=['POST'])
def create_session():
    """Create a new chat session"""
    try:
        session_id = session_manager.create_session()

        # Store session ID in Flask session
        flask_session['chat_session_id'] = session_id

        # Initialize model and conversation use case for this session
        model_loader = container.model_loader()

        # Create a new conversation use case for this session
        conversation_uc = container.conversation_uc(
            output_port=web_chat_adapter
        )

        # Store in session manager
        session_manager.set_session_data(session_id, 'conversation_uc', conversation_uc)
        session_manager.set_session_data(session_id, 'model_loader', model_loader)

        return jsonify({'session_id': session_id})
    except Exception as e:
        app.logger.error(f"Error creating session: {str(e)}")
        return jsonify({'error': str(e)}), 500


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')


@socketio.on('join_session')
def handle_join_session(data):
    """Join a specific chat session room"""
    session_id = data.get('session_id')

    if session_id and session_manager.get_session(session_id):
        join_room(session_id)
        # Store the session ID in the Flask session
        flask_session['chat_session_id'] = session_id
        emit('session_joined', {'status': 'success'})
    else:
        emit('session_joined', {'status': 'error', 'message': 'Invalid session'})


@socketio.on('user_message')
def handle_message(data):
    """Handle incoming user message"""
    print(f"Received message: {data}")  # Debug log
    session_id = data.get('session_id')
    message = data.get('message')
    file_path = data.get('file_path')

    if not session_id or not message:
        print("Invalid request parameters")  # Debug log
        emit('error', {'message': 'Invalid request parameters'})
        return

    session_data = session_manager.get_session(session_id)
    if not session_data:
        print(f"Invalid session: {session_id}")  # Debug log
        emit('error', {'message': 'Invalid session'})
        return

    print(f"Session data: {session_data.keys()}")  # Debug log
    conversation_uc = session_data['conversation_uc']
    model_loader = session_data['model_loader']

    # Process file if provided
    code_content = None
    if file_path:
        try:
            print(f"Reading file: {file_path}")  # Debug log
            code_content = web_file_adapter.read_file(file_path)
        except Exception as e:
            print(f"Error reading file: {str(e)}")  # Debug log
            emit('error', {'message': f'Error reading file: {str(e)}'})
            return

    # Emit message receipt acknowledgment
    print("Emitting processing status")  # Debug log
    emit('message_received', {'status': 'processing'})

    # Process in a separate thread to not block the server
    def process_message():
        try:
            print("Starting model processing")  # Debug log

            # Set the current room in the chat adapter for streaming
            web_chat_adapter = conversation_uc.output_port
            web_chat_adapter.set_current_room(session_id)

            # Set the output adapter in the response generator for streaming
            response_generator = conversation_uc.response_generator
            if hasattr(response_generator, 'set_output_adapter'):
                response_generator.set_output_adapter(web_chat_adapter)

            # Generate response
            full_response = conversation_uc.handle_message(message, code_content, model_loader)

            # Store the full response in the session history
            print(f"Full response generated, length: {len(full_response)}")

            # Signal completion to the client
            # We need to ensure the frontend gets a completion signal regardless
            socketio.emit('assistant_response_complete',
                          {'status': 'complete'},
                          room=session_id)

            print("Response sent to client")  # Debug log

        except Exception as e:
            print(f"Error generating response: {str(e)}")  # Debug log
            import traceback
            traceback.print_exc()  # Print full traceback
            socketio.emit('error',
                          {'message': f'Error generating response: {str(e)}'},
                          room=session_id)

    thread = threading.Thread(target=process_message)
    thread.daemon = True  # Make thread daemon so it doesn't block app shutdown
    thread.start()
    print(f"Started processing thread {thread.name}")  # Debug log


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handle file uploads"""
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
        file_path = web_file_adapter.save_uploaded_file(file)

        # Return file info along with session ID to help client stay in context
        return jsonify({
            'file_path': file_path,
            'filename': os.path.basename(file_path),
            'session_id': session_id  # Return session ID to client
        })
    except Exception as e:
        app.logger.error(f"Error uploading file: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Create uploads directory if it doesn't exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # Run the app
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)