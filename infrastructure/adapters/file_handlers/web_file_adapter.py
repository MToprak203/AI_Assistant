# infrastructure/adapters/file_handlers/web_file_adapter.py
from core.ports.file_handler_port import FileHandlerPort
from werkzeug.utils import secure_filename
import os
import uuid
from typing import Dict, List


class WebFileAdapter(FileHandlerPort):
    def __init__(self, upload_folder='uploads'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)

        # Create separate folders for different session files to prevent conflicts
        self.session_upload_folders = {}

        # Track project files by session
        self.session_files = {}

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

            # Track this file for the session
            if session_id:
                if session_id not in self.session_files:
                    self.session_files[session_id] = []
                self.session_files[session_id].append({
                    'original_name': original_filename,
                    'path': file_path,
                    'filename': filename
                })

            print(f"File saved at: {file_path}")
            return file_path
        except Exception as e:
            print(f"Error saving file: {str(e)}")
            raise IOError(f"Failed to save file: {str(e)}")

    def save_multiple_files(self, files, session_id=None) -> List[Dict]:
        """Save multiple uploaded files and return their details"""
        if not files or not isinstance(files, list):
            raise ValueError("No files provided or invalid format")

        results = []
        for file in files:
            try:
                file_path = self.save_uploaded_file(file, session_id)
                results.append({
                    'file_path': file_path,
                    'filename': os.path.basename(file_path),
                    'original_name': file.filename
                })
            except Exception as e:
                print(f"Error saving file '{file.filename}': {str(e)}")
                # Continue with other files even if one fails

        return results

    def get_session_files(self, session_id) -> List[Dict]:
        """Get all files uploaded for a specific session"""
        return self.session_files.get(session_id, [])

    def get_project_structure(self, session_id) -> Dict[str, Dict]:
        """
        Get a structured representation of all files in the session
        Returns a dict with filenames as keys and content + metadata as values
        """
        if session_id not in self.session_files:
            return {}

        project = {}
        for file_info in self.session_files[session_id]:
            try:
                content = self.read_file(file_info['path'])
                project[file_info['original_name']] = {
                    'content': content,
                    'path': file_info['path'],
                    'size': os.path.getsize(file_info['path'])
                }
            except Exception as e:
                print(f"Error loading file {file_info['path']}: {str(e)}")
                # Skip files that can't be read

        return project