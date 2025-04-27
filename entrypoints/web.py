# entrypoints/web.py
import os
import threading
import time
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

        # Track model initialization status
        self.model_initialization_threads = {}

        # Register routes and socket events
        self._register_routes()
        self._register_socket_events()

    def _register_routes(self):
        """Register all HTTP routes."""

        @self.app.route('/api/health-check', methods=['GET'])
        def health_check():
            return jsonify({"status": "ok"})

        @self.app.route('/')
        def index():
            """Render the main chat interface."""
            # Get session ID from request (header or Flask session)
            session_id = get_session_id_from_request()

            # Check if model is initialized
            if not self.model_manager.is_initialized() and not self.model_manager.is_initializing():
                # If model is not initialized or initializing, redirect to loading page
                from flask import redirect
                redirect_url = '/loading'
                if session_id:
                    redirect_url += f'?session_id={session_id}'
                return redirect(redirect_url)

            # Store session ID in cookie if it's available
            if session_id:
                flask_session['chat_session_id'] = session_id

            return render_template('index.html')

        @self.app.route('/loading')
        def loading():
            """Render the loading page."""
            # Get session ID from request or query parameter
            session_id = get_session_id_from_request()

            # Check for session ID in query parameters
            if not session_id and request.args.get('session_id'):
                session_id = request.args.get('session_id')
                flask_session['chat_session_id'] = session_id

            return render_template('loading.html')

        @self.app.route('/<path:filename>')
        def serve_static(filename):
            """Serve static files."""
            return send_from_directory(self.app.static_folder, filename)

        @self.app.route('/api/sessions', methods=['POST'])
        def create_session():
            """Create a new chat session."""
            try:
                # Create new session
                session_id = self.session_manager.create_session()

                # Store session ID in Flask session
                flask_session['chat_session_id'] = session_id

                # Create a new conversation use case for this session
                conversation_uc = self.container.conversation_uc(
                    output_port=self.chat_adapter
                )

                # Store in session manager
                self.session_manager.set_session_data(session_id, 'conversation_uc', conversation_uc)

                # Check if model is initialized
                if not self.model_manager.is_initialized():
                    # Start model initialization in background
                    self._initialize_model_async(session_id)
                else:
                    # Model already initialized, set it for this conversation
                    model, tokenizer = self.model_manager.get_model_and_tokenizer()
                    conversation_uc.set_model_and_tokenizer(model, tokenizer)

                    # Notify client that model is ready
                    self.socketio.emit('model_initialized',
                                       {'status': 'success'},
                                       room=session_id)

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

                # Get the content of the file
                file_content = self.file_adapter.read_file(file_path)

                # Add to conversation use case project files
                session_data = self.session_manager.get_session(session_id)
                if session_data and 'conversation_uc' in session_data:
                    conversation_uc = session_data['conversation_uc']
                    conversation_uc.add_project_file(os.path.basename(file.filename), file_content)

                # Return file info along with session ID
                return jsonify({
                    'file_path': file_path,
                    'filename': os.path.basename(file_path),
                    'original_name': file.filename,
                    'session_id': session_id
                })
            except Exception as e:
                self.app.logger.error(f"Error uploading file: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/upload/multiple', methods=['POST'])
        def upload_multiple_files():
            """Handle multiple file uploads as a project, preserving directory structure."""
            try:
                # Get session ID from request
                session_id = get_session_id_from_request()
                print(f"Processing multiple file upload for session: {session_id}")

                # Check request content type
                is_json = request.is_json or request.headers.get('Content-Type', '').startswith('application/json')

                # Handle JSON data (from Electron app)
                if is_json:
                    data = request.get_json()

                    # Try to get session ID from request body if not found in header/cookie
                    if not session_id and data and 'session_id' in data:
                        session_id = data.get('session_id')
                        if session_id:
                            flask_session['chat_session_id'] = session_id

                # Ensure we have a valid session
                if not session_id:
                    return jsonify({'error': 'No active session'}), 400

                session_data = self.session_manager.get_session(session_id)
                if not session_data or 'conversation_uc' not in session_data:
                    return jsonify({'error': 'Invalid session'}), 400

                conversation_uc = session_data['conversation_uc']

                # Handle JSON data for file upload
                if is_json:
                    data = request.get_json()

                    files_data = data.get('files', [])
                    if not files_data:
                        return jsonify({
                            'error': 'No files found in request',
                            'skipped': 0,
                            'skipped_files': []
                        }), 400

                    # Add all files to the conversation
                    processed_files = []
                    for file_info in files_data:
                        try:
                            filename = file_info.get('filename')
                            content = file_info.get('content')

                            if not filename or not content:
                                continue

                            # Add to project files
                            conversation_uc.add_project_file(filename, content)
                            processed_files.append({
                                'filename': filename,
                                'size': len(content)
                            })
                        except Exception as e:
                            print(f"Error adding file to project: {str(e)}")
                            # Continue with other files

                    return jsonify({
                        'files': processed_files,
                        'count': len(processed_files),
                        'processed': len(processed_files),
                        'skipped': 0,
                        'session_id': session_id,
                        'message': f"Uploaded {len(processed_files)} files"
                    })
                else:
                    # Original form-data handling
                    if 'files[]' not in request.files:
                        return jsonify({'error': 'No files in request'}), 400

                    files = request.files.getlist('files[]')
                    if not files or len(files) == 0:
                        return jsonify({'error': 'No files selected'}), 400

                    # Check for directory structure info
                    paths = request.form.getlist('paths[]')
                    if paths:
                        print(f"Received {len(paths)} directory paths for {len(files)} files")

                    # Save all code files and add to project
                    upload_result = self.file_adapter.save_multiple_files(files, session_id)
                    saved_files = upload_result.get('saved_files', [])
                    skipped_files = upload_result.get('skipped_files', [])

                    if not saved_files:
                        return jsonify({
                            'error': 'No code files found to process',
                            'skipped': len(skipped_files),
                            'skipped_files': skipped_files
                        }), 400

                    # Add all saved files to the conversation
                    for file_info in saved_files:
                        try:
                            # Read content
                            file_content = self.file_adapter.read_file(file_info['file_path'])

                            # Add to project files
                            # Use the original_name which includes the directory path
                            conversation_uc.add_project_file(file_info['original_name'], file_content)
                        except Exception as e:
                            print(f"Error adding file to project: {str(e)}")
                            # Continue with other files

                    # Return information about uploaded files
                    return jsonify({
                        'files': saved_files,
                        'count': len(saved_files),
                        'processed': len(saved_files),
                        'skipped': len(skipped_files),
                        'session_id': session_id,
                        'message': f"Uploaded {len(saved_files)} code files (skipped {len(skipped_files)} non-code files)"
                    })

            except Exception as e:
                self.app.logger.error(f"Error uploading multiple files: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/project', methods=['GET'])
        def get_project_files():
            """Get information about all project files in the current session."""
            session_id = flask_session.get('chat_session_id')
            if not session_id:
                return jsonify({'error': 'No active session'}), 400

            try:
                session_data = self.session_manager.get_session(session_id)
                if not session_data or 'conversation_uc' not in session_data:
                    return jsonify({'error': 'Invalid session'}), 400

                conversation_uc = session_data['conversation_uc']
                project_files = conversation_uc.get_project_files()

                # Format response
                files = []
                for filename, project_file in project_files.items():
                    files.append({
                        'filename': filename,
                        'description': project_file.description,
                        'size': len(project_file.content)
                    })

                return jsonify({
                    'files': files,
                    'count': len(files),
                    'session_id': session_id
                })
            except Exception as e:
                self.app.logger.error(f"Error getting project files: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/project/file/<path:filename>', methods=['GET'])
        def get_project_file(filename):
            """Get content of a specific project file."""
            session_id = flask_session.get('chat_session_id')
            if not session_id:
                return jsonify({'error': 'No active session'}), 400

            try:
                session_data = self.session_manager.get_session(session_id)
                if not session_data or 'conversation_uc' not in session_data:
                    return jsonify({'error': 'Invalid session'}), 400

                conversation_uc = session_data['conversation_uc']
                content = conversation_uc.get_file_content(filename)

                if content is None:
                    return jsonify({'error': 'File not found'}), 404

                return jsonify({
                    'filename': filename,
                    'content': content
                })
            except Exception as e:
                self.app.logger.error(f"Error getting file content: {str(e)}")
                return jsonify({'error': str(e)}), 500

    # entrypoints/web.py - Socket Event Handlers

    def _register_socket_events(self):
        """Register all Socket.IO event handlers for the web application."""

        @self.socketio.on('connect')
        def handle_connect():
            """Handle new client connections."""
            print('Client connected')

        @self.socketio.on('disconnect')
        def handle_disconnect():
            """Handle client disconnections."""
            print('Client disconnected')

        @self.socketio.on('join_session')
        def handle_join_session(data):
            """
            Handle a client joining a specific chat session.
            Creates a Socket.IO room for the session.
            """
            session_id = data.get('session_id')
            print(f"Client joining session: {session_id}")

            if not session_id:
                emit('session_joined', {'status': 'error', 'message': 'Missing session ID'})
                return

            # Check if session exists
            session_data = self.session_manager.get_session(session_id)
            if not session_data:
                emit('session_joined', {'status': 'error', 'message': 'Invalid session'})
                return

            # Join the Socket.IO room for this session
            join_room(session_id)

            # Store the session ID in the Flask session
            flask_session['chat_session_id'] = session_id

            # Tell client they've successfully joined
            emit('session_joined', {'status': 'success'})

            # Check model status and notify client accordingly
            if self.model_manager.is_initialized():
                # If model is already initialized, notify client immediately
                print(f"Model already initialized, notifying client in session {session_id}")
                emit('model_initialized', {'status': 'success'})
            elif self.model_manager.is_initializing():
                # If model is currently being initialized, notify client of loading status
                print(f"Model initialization in progress, notifying client in session {session_id}")
                emit('model_status', {
                    'status': 'loading',
                    'message': 'Loading AI model...'
                })
            else:
                # Start model initialization - this will check again if model is initializing
                print(f"Starting model initialization for session {session_id}")
                self._initialize_model_async(session_id)

        @self.socketio.on('user_message')
        def handle_message(data):
            """
            Handle user messages and file operations.

            Parameters:
            - data: Dictionary containing message details:
              - session_id: The session identifier
              - message: The text message from the user
              - file_path: Optional path to a file being uploaded/shared
              - file_focus: Optional filename to focus on in the project
            """
            # Log and validate the incoming message
            print(f"Received message: {data}")

            # Extract data from request
            session_id = data.get('session_id')
            message = data.get('message')
            file_path = data.get('file_path')  # Optional file path if a file was uploaded
            file_focus = data.get('file_focus')  # Optional filename to focus on

            # Validate required fields
            if not session_id or not message:
                print("Invalid request: missing session_id or message")
                emit('error', {'message': 'Invalid request parameters'})
                return

            # Get session data
            session_data = self.session_manager.get_session(session_id)
            if not session_data:
                print(f"Invalid session: {session_id}")
                emit('error', {'message': 'Invalid session'})
                return

            # Get conversation use case for this session
            conversation_uc = session_data.get('conversation_uc')
            if not conversation_uc:
                print(f"Missing conversation use case for session: {session_id}")
                emit('error', {'message': 'Session configuration error'})
                return

            # Process uploaded file if provided
            code_content = None
            if file_path:
                try:
                    print(f"Reading file: {file_path}")
                    file_content = self.file_adapter.read_file(file_path)

                    # Get filename from path
                    filename = os.path.basename(file_path)

                    # Create code dict with both filename and content
                    code_content = {
                        'filename': filename,
                        'content': file_content
                    }
                except Exception as e:
                    print(f"Error reading file: {str(e)}")
                    emit('error', {'message': f'Error reading file: {str(e)}'})
                    return

            # Change focus to a specific file if requested
            if file_focus:
                try:
                    success = conversation_uc.set_primary_file(file_focus)
                    if success:
                        print(f"Set focus to file: {file_focus}")
                    else:
                        print(f"Failed to set focus to file: {file_focus} (file not found)")
                except Exception as e:
                    print(f"Error setting file focus: {str(e)}")
                    # Continue processing even if focus setting fails

            # Tell client we've received the message and are processing
            emit('message_received', {'status': 'processing'})

            # Process message in a separate thread to avoid blocking
            self._process_message_async(session_id, conversation_uc, message, code_content)

        @self.app.route('/api/update-file', methods=['POST'])
        def update_file():
            """Update a file in the project."""
            try:
                # Get session ID from request
                session_id = get_session_id_from_request()

                # Check if this is a JSON request or form data
                if request.is_json:
                    data = request.get_json()
                    session_id = data.get('session_id', session_id)
                    filename = data.get('filename')
                    content = data.get('content')
                else:
                    session_id = request.form.get('session_id', session_id)
                    filename = request.form.get('filename')
                    content = request.form.get('content')

                # Ensure we have a valid session
                if not session_id:
                    return jsonify({'error': 'No active session'}), 400

                session_data = self.session_manager.get_session(session_id)
                if not session_data or 'conversation_uc' not in session_data:
                    return jsonify({'error': 'Invalid session'}), 400

                # Make sure we have filename and content
                if not filename or not content:
                    return jsonify({'error': 'Missing filename or content'}), 400

                conversation_uc = session_data['conversation_uc']

                # Update the file in the conversation
                conversation_uc.add_project_file(filename, content)

                return jsonify({
                    'success': True,
                    'message': f"Updated file: {filename}",
                    'filename': filename
                })
            except Exception as e:
                self.app.logger.error(f"Error updating file: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.socketio.on('project_update')
        def handle_project_update(data):
            """
            Handle project file operations like focusing on a file or removing a file.

            Parameters:
            - data: Dictionary containing:
              - session_id: The session identifier
              - action: The action to perform ('focus' or 'remove')
              - filename: The name of the file to operate on
            """
            session_id = data.get('session_id')
            action = data.get('action')
            filename = data.get('filename')

            # Validate required parameters
            if not session_id or not action or not filename:
                emit('error', {'message': 'Invalid request parameters'})
                return

            # Get session data
            session_data = self.session_manager.get_session(session_id)
            if not session_data or 'conversation_uc' not in session_data:
                emit('error', {'message': 'Invalid session'})
                return

            # Get conversation use case
            conversation_uc = session_data['conversation_uc']

            try:
                result = False
                message = ""

                if action == 'focus':
                    # Set focus to a specific file
                    result = conversation_uc.set_primary_file(filename)
                    message = f"Now focusing on {filename}" if result else f"File {filename} not found"

                elif action == 'remove':
                    # Remove a file from the project
                    result = conversation_uc.remove_project_file(filename)
                    message = f"Removed {filename}" if result else f"File {filename} not found"
                else:
                    message = f"Unsupported action: {action}"

                # Send result back to client
                emit('project_update_result', {
                    'success': result,
                    'message': message,
                    'action': action,
                    'filename': filename
                })

            except Exception as e:
                print(f"Error in project update: {str(e)}")
                emit('error', {'message': f'Error updating project: {str(e)}'})

        @self.socketio.on('get_project_files')
        def handle_get_project_files(data):
            """
            Handle request for the current project files.

            Parameters:
            - data: Dictionary containing:
              - session_id: The session identifier
            """
            session_id = data.get('session_id')

            if not session_id:
                emit('error', {'message': 'Missing session ID'})
                return

            # Get session data
            session_data = self.session_manager.get_session(session_id)
            if not session_data or 'conversation_uc' not in session_data:
                emit('error', {'message': 'Invalid session'})
                return

            # Get conversation use case
            conversation_uc = session_data['conversation_uc']

            try:
                # Get project files
                project_files = conversation_uc.get_project_files()
                primary_file = conversation_uc.primary_file

                # Format response
                files = []
                for filename, project_file in project_files.items():
                    files.append({
                        'filename': filename,
                        'description': project_file.description,
                        'size': len(project_file.content),
                        'is_primary': filename == primary_file
                    })

                # Send result back to client
                emit('project_files', {
                    'files': files,
                    'count': len(files),
                    'primary_file': primary_file
                })

            except Exception as e:
                print(f"Error getting project files: {str(e)}")
                emit('error', {'message': f'Error getting project files: {str(e)}'})

    def _initialize_model_async(self, session_id):
        """Initialize model in a separate thread and update the client."""

        def initialize_task():
            try:
                # Check if model is already initialized or initializing
                if self.model_manager.is_initialized():
                    print("Model already initialized, notifying client")
                    # Notify client that model is ready
                    self.socketio.emit('model_initialized',
                                       {'status': 'success'},
                                       room=session_id)
                    return

                if self.model_manager.is_initializing():
                    print(f"Model initialization already in progress, notifying client")
                    # Notify client that model is being loaded
                    self.socketio.emit('model_status',
                                       {'status': 'loading', 'message': 'Loading AI model...'},
                                       room=session_id)
                    return

                # Notify client that model loading has started
                self.socketio.emit('model_status',
                                   {'status': 'loading', 'message': 'Loading AI model...'},
                                   room=session_id)

                # Initialize the model
                print(f"Initializing model for session {session_id}...")
                start_time = time.time()

                # Initialize the model
                self.model_manager.initialize(self.container.config.model_name())

                model, tokenizer = self.model_manager.get_model_and_tokenizer()

                # Calculate loading time
                loading_time = time.time() - start_time
                print(f"Model initialized in {loading_time:.2f} seconds")

                # Update the conversation use case for this session
                session_data = self.session_manager.get_session(session_id)
                if session_data and 'conversation_uc' in session_data:
                    conversation_uc = session_data['conversation_uc']
                    conversation_uc.set_model_and_tokenizer(model, tokenizer)

                # Notify client that model is ready
                print(f"Model initialized, sending success to session {session_id}")
                self.socketio.emit('model_initialized',
                                   {'status': 'success'},
                                   room=session_id)

                # Remove thread reference
                if session_id in self.model_initialization_threads:
                    del self.model_initialization_threads[session_id]

            except Exception as e:
                print(f"Error initializing model: {str(e)}")
                import traceback
                traceback.print_exc()

                # Notify client of error
                self.socketio.emit('model_initialized',
                                   {'status': 'error', 'message': f'Error initializing model: {str(e)}'},
                                   room=session_id)

                # Remove thread reference
                if session_id in self.model_initialization_threads:
                    del self.model_initialization_threads[session_id]

        # Only start a new thread if the model isn't already initialized or initializing
        if not self.model_manager.is_initialized() and not self.model_manager.is_initializing():
            # Start model initialization in a separate thread
            thread = threading.Thread(target=initialize_task)
            thread.daemon = True
            thread.start()

            # Store thread reference
            self.model_initialization_threads[session_id] = thread
            print(f"Started model initialization thread {thread.name} for session {session_id}")
        else:
            # Call initialize task directly (it will just notify the client)
            initialize_task()

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


def get_session_id_from_request():
    """Extract session ID from request - either from Flask session or X-Session-Id header"""
    from flask import request, session as flask_session

    # First try to get from Flask session
    session_id = flask_session.get('chat_session_id')

    # If not in Flask session, try X-Session-Id header
    if not session_id and 'X-Session-Id' in request.headers:
        session_id = request.headers.get('X-Session-Id')

        # Store in Flask session for consistency
        if session_id:
            flask_session['chat_session_id'] = session_id

    return session_id

def create_app():
    """Factory function to create and initialize the application."""
    web_app = WebApp()
    return web_app.app, web_app.socketio, web_app


if __name__ == '__main__':
    app, socketio, web_app = create_app()
    web_app.run(debug=True)
