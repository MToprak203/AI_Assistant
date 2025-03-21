# infrastructure/adapters/file_handlers/web_file_adapter.py
from core.ports.file_handler_port import FileHandlerPort
from werkzeug.utils import secure_filename
import os


class WebFileAdapter(FileHandlerPort):
    def __init__(self, upload_folder='uploads'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)

    def read_file(self, path: str) -> str:
        """Read file from disk by path"""
        try:
            with open(path, 'r', encoding='utf-8') as file:
                return file.read()
        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {path}")
        except IOError as e:
            raise IOError(f"Error reading file: {str(e)}")

    def save_uploaded_file(self, file) -> str:
        """Save uploaded file and return path"""
        if file:
            filename = secure_filename(file.filename)
            file_path = os.path.join(self.upload_folder, filename)
            file.save(file_path)
            return file_path
        return None