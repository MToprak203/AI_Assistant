# infrastructure/adapters/file_handlers/local_file_adapter.py
from core.ports.file_handler_port import FileHandlerPort

class LocalFileAdapter(FileHandlerPort):
    def read_file(self, path: str) -> str:
        try:
            with open(path, 'r', encoding='utf-8') as file:
                return file.read()
        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {path}")
        except IOError as e:
            raise IOError(f"Error reading file: {str(e)}")