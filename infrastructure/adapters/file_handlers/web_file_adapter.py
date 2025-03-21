# infrastructure/adapters/file_handlers/web_file_adapter.py
from core.ports.file_handler_port import FileHandlerPort
from werkzeug.utils import secure_filename
import os
import uuid


class WebFileAdapter(FileHandlerPort):
    def __init__(self, upload_folder='uploads'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)

        # Create separate folders for different session files to prevent conflicts
        self.session_upload_folders = {}

    def read_file(self, path: str) -> str:
        """Read file from disk by path"""
        try:
            with open(path, 'r', encoding='utf-8') as file:
                return file.read()
        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {path}")
        except IOError as e:
            raise IOError(f"Error reading file: {str(e)}")
        except UnicodeDecodeError:
            # Try with a different encoding or in binary mode for non-text files
            try:
                with open(path, 'rb') as file:
                    return f"[Binary file content - {os.path.getsize(path)} bytes]"
            except Exception as e:
                raise IOError(f"Error reading binary file: {str(e)}")

    def save_uploaded_file(self, file, session_id=None) -> str:
        """Save uploaded file and return path"""
        if not file:
            raise ValueError("No file provided")

        try:
            # Use session folder if provided
            upload_folder = self.upload_folder
            if session_id:
                # Create session-specific folder if it doesn't exist
                if session_id not in self.session_upload_folders:
                    session_folder = os.path.join(self.upload_folder, f"session_{session_id}")
                    os.makedirs(session_folder, exist_ok=True)
                    self.session_upload_folders[session_id] = session_folder
                upload_folder = self.session_upload_folders[session_id]

            # Secure the filename and add a unique identifier to prevent conflicts
            original_filename = secure_filename(file.filename)
            file_extension = os.path.splitext(original_filename)[1]
            unique_id = str(uuid.uuid4())[:8]  # Use first 8 chars of UUID
            filename = f"{os.path.splitext(original_filename)[0]}_{unique_id}{file_extension}"

            file_path = os.path.join(upload_folder, filename)
            file.save(file_path)

            print(f"File saved at: {file_path}")
            return file_path
        except Exception as e:
            print(f"Error saving file: {str(e)}")
            raise IOError(f"Failed to save file: {str(e)}")