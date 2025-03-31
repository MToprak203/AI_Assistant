# infrastructure/adapters/file_handlers/web_file_adapter.py
from core.ports.file_handler_port import FileHandlerPort
from werkzeug.utils import secure_filename
import os
import uuid
from typing import Dict, List, Optional, Union


class WebFileAdapter(FileHandlerPort):
    def __init__(self, upload_folder='uploads'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)

        # Create separate folders for different session files to prevent conflicts
        self.session_upload_folders = {}

        # Track project files by session
        self.session_files = {}

        # List of code file extensions to accept
        self.code_extensions = {
            # Programming languages
            '.py', '.java', '.js', '.jsx', '.ts', '.tsx', '.html', '.css',
            '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php',
            '.swift', '.kt', '.scala', '.groovy', '.dart', '.lua', '.r',
            # Config/markup files
            '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.md', '.sql',
            # Shell scripts
            '.sh', '.bash', '.zsh', '.bat', '.ps1',
            # Other code files
            '.gradle', '.properties', '.tf', '.ipynb'
        }

    def is_code_file(self, filename: str) -> bool:
        """Check if a file is a code file based on its extension"""
        _, file_ext = os.path.splitext(filename.lower())
        return file_ext in self.code_extensions

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

    def save_uploaded_file(self, file, session_id=None, relative_path: Optional[str] = None) -> Union[str, None]:
        """
        Save uploaded file and return path

        Args:
            file: The uploaded file
            session_id: Optional session ID
            relative_path: Optional relative path for preserving directory structure

        Returns:
            str: Path to the saved file or None if file was skipped
        """
        if not file:
            raise ValueError("No file provided")

        # Skip non-code files
        if not self.is_code_file(file.filename):
            print(f"Skipping non-code file: {file.filename}")
            return None

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

            # If we have a relative path, create the directory structure
            if relative_path:
                # Create the directory structure using the relative path
                upload_folder = os.path.join(upload_folder, relative_path)
                os.makedirs(upload_folder, exist_ok=True)

            # Secure the filename
            original_filename = secure_filename(file.filename)
            base_name, file_extension = os.path.splitext(original_filename)

            # Use just the filename without path for the saved file name
            if '/' in original_filename:
                original_filename = original_filename.split('/')[-1]

            # Add a unique identifier to prevent conflicts
            unique_id = str(uuid.uuid4())[:8]  # Use first 8 chars of UUID
            filename = f"{base_name}_{unique_id}{file_extension}"

            file_path = os.path.join(upload_folder, filename)
            file.save(file_path)

            # Calculate the display path (including directory structure)
            display_path = os.path.join(relative_path, original_filename) if relative_path else original_filename

            # Track this file for the session
            if session_id:
                if session_id not in self.session_files:
                    self.session_files[session_id] = []
                self.session_files[session_id].append({
                    'original_name': display_path,  # Include directory in the original name
                    'path': file_path,
                    'filename': filename,
                    'directory': relative_path or ""
                })

            print(f"File saved at: {file_path}")
            return file_path
        except Exception as e:
            print(f"Error saving file: {str(e)}")
            raise IOError(f"Failed to save file: {str(e)}")

    def save_multiple_files(self, files, session_id=None) -> Dict:
        """
        Save multiple uploaded files preserving directory structure and return their details

        Args:
            files: List of uploaded files
            session_id: Optional session ID

        Returns:
            Dict containing lists of saved and skipped files
        """
        if not files or not isinstance(files, list):
            raise ValueError("No files provided or invalid format")

        results = []
        skipped_files = []

        # Get relative paths from the request if available
        from flask import request
        paths = request.form.getlist('paths[]') if hasattr(request, 'form') else []

        paths_map = {}
        if paths:
            # Map files to their paths if paths are provided
            for i, file in enumerate(files):
                if i < len(paths):
                    paths_map[file.filename] = paths[i]

        for file in files:
            if not file or file.filename == '':
                continue  # Skip empty files

            try:
                # Check if it's a code file
                if not self.is_code_file(file.filename):
                    print(f"Skipping non-code file: {file.filename}")
                    skipped_files.append(file.filename)
                    continue

                # Get the relative path for this file if available
                relative_path = paths_map.get(file.filename, "")

                # Extract relative path from webkitRelativePath attribute if not provided in paths_map
                if not relative_path and hasattr(file, 'filename') and '/' in file.filename:
                    # Split the path and remove the filename to get the directory structure
                    path_parts = file.filename.split('/')
                    if len(path_parts) > 1:
                        # Join all parts except the last one (the filename)
                        relative_path = '/'.join(path_parts[:-1])

                # Save the file with its relative path
                file_path = self.save_uploaded_file(file, session_id, relative_path)

                if file_path:  # Only add to results if file was saved
                    # Calculate display name (with directory)
                    display_name = os.path.join(relative_path,
                                                os.path.basename(file.filename)) if relative_path else file.filename

                    results.append({
                        'file_path': file_path,
                        'filename': os.path.basename(file_path),
                        'original_name': display_name,
                        'directory': relative_path
                    })
            except Exception as e:
                print(f"Error saving file '{file.filename}': {str(e)}")
                # Continue with other files even if one fails

        return {
            'saved_files': results,
            'skipped_files': skipped_files
        }

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
                    'size': os.path.getsize(file_info['path']),
                    'directory': file_info.get('directory', "")
                }
            except Exception as e:
                print(f"Error loading file {file_info['path']}: {str(e)}")
                # Skip files that can't be read

        return project