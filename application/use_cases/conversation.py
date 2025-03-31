# application/use_cases/conversation.py
from core.domain.models import ChatMessage, AnalysisConfig, ProjectFile
from typing import List, Optional, Dict, Set


class ConversationUseCase:
    def __init__(self,
                 output_port,
                 response_generator,
                 prompt_builder,
                 config: AnalysisConfig):
        self.output_port = output_port
        self.response_generator = response_generator
        self.prompt_builder = prompt_builder
        self.config = config
        self.history: List[ChatMessage] = []
        self.model = None
        self.tokenizer = None

        # Project files management
        self.project_files: Dict[str, ProjectFile] = {}  # filename -> ProjectFile
        self.primary_file: Optional[str] = None  # The file currently being focused on
        self.mentioned_files: Set[str] = set()  # Track which files have been mentioned recently

        # Connect the response generator to the output port if possible
        if hasattr(self.response_generator, 'set_output_adapter'):
            self.response_generator.set_output_adapter(self.output_port)

    def initialize_with_code(self, code: str, task: str = "Refactor according to SOLID principles",
                             filename: str = "main.py"):
        """Initialize conversation with code content"""
        initial_message = ChatMessage(
            role="user",
            content=f"{task}:\n```\n{code}\n```\n"
        )
        self._add_to_history(initial_message)

        # Add as project file
        self.add_project_file(filename, code)
        self.primary_file = filename

        return initial_message

    def add_project_file(self, filename: str, content: str, description: Optional[str] = None):
        """Add or update a file in the project"""
        self.project_files[filename] = ProjectFile(
            filename=filename,
            content=content,
            description=description or f"File: {filename}"
        )
        self.mentioned_files.add(filename)

        # If this is the first file, set it as primary
        if self.primary_file is None:
            self.primary_file = filename

    def remove_project_file(self, filename: str) -> bool:
        """Remove a file from the project"""
        if filename in self.project_files:
            del self.project_files[filename]
            self.mentioned_files.discard(filename)

            # If we removed the primary file, select a new one if available
            if self.primary_file == filename:
                self.primary_file = next(iter(self.project_files)) if self.project_files else None
            return True
        return False

    def set_primary_file(self, filename: str) -> bool:
        """Set the file to focus on"""
        if filename in self.project_files:
            self.primary_file = filename
            self.mentioned_files.add(filename)
            return True
        return False

    def set_model_and_tokenizer(self, model, tokenizer):
        """Set the model and tokenizer to use for this conversation"""
        self.model = model
        self.tokenizer = tokenizer

    def _build_project_context(self, max_files: int = 3, token_limit: int = 6000) -> str:
        """Build context string with project file information"""
        if not self.project_files:
            return ""

        # Start with the primary file if it exists
        selected_files = []
        if self.primary_file:
            selected_files.append(self.primary_file)

        # Add recently mentioned files that aren't already included
        for filename in self.mentioned_files:
            if filename != self.primary_file and len(selected_files) < max_files:
                selected_files.append(filename)

        # Add other files up to the limit
        for filename in self.project_files:
            if filename not in selected_files and len(selected_files) < max_files:
                selected_files.append(filename)

        # Build context with files
        context_parts = ["Project files:"]
        total_chars = 0

        # Add primary file with full content
        if self.primary_file:
            primary = self.project_files[self.primary_file]
            primary_content = f"\nPrimary file - {primary.filename}:\n```\n{primary.content}\n```\n"
            context_parts.append(primary_content)
            total_chars += len(primary_content)

        # Add project structure with all filenames
        file_list = "\nProject structure:\n" + "\n".join([f"- {f}" for f in self.project_files.keys()])
        context_parts.append(file_list)
        total_chars += len(file_list)

        # Add content from other selected files if we have space
        for filename in selected_files:
            if filename == self.primary_file:
                continue  # Already added

            file = self.project_files[filename]
            file_content = f"\nFile - {file.filename}:\n```\n{file.content}\n```\n"

            # Check if adding would exceed token limit (rough approximation)
            if total_chars + len(file_content) > token_limit:
                context_parts.append(f"\nNote: Additional files exist but were omitted for brevity.")
                break

            context_parts.append(file_content)
            total_chars += len(file_content)

        return "\n".join(context_parts)

    def handle_message(self, user_message: str, code_file: Optional[Dict] = None, model_loader=None) -> str:
        """
        Handle a single message from the user and return the assistant response

        Parameters:
        - user_message: The user's message text
        - code_file: Optional dict with 'filename' and 'content' keys to add a new file
        - model_loader: Optional model loader to use if model not set
        """
        message_content = user_message

        # Process new code file if provided
        if code_file and isinstance(code_file, dict) and 'filename' in code_file and 'content' in code_file:
            filename = code_file['filename']
            content = code_file['content']

            # Add the file to our project
            self.add_project_file(filename, content)
            self.primary_file = filename  # Focus on the new file

            # Update message to mention the new file
            message_content = f"{user_message}\n\nI've uploaded a new file: {filename}"

        # Check if we need to refresh context about the project
        needs_context = not any("Project files:" in msg.content for msg in self.history[-2:])

        if self.project_files and needs_context:
            # Add project context to the message
            project_context = self._build_project_context()
            message_with_context = f"{message_content}\n\n{project_context}"
            self._add_to_history(ChatMessage(role="user", content=message_with_context))
        else:
            # No project context needed or available
            self._add_to_history(ChatMessage(role="user", content=message_content))

        # Load model if not available
        if self.model is None or self.tokenizer is None:
            if model_loader:
                self.model, self.tokenizer = model_loader.load_model_and_tokenizer()
            else:
                raise ValueError(
                    "Model and tokenizer not set. Either call set_model_and_tokenizer() or provide model_loader")

        # Build prompt and generate response
        prompt = self.prompt_builder.build_prompt(self.history, self.tokenizer)

        # Make sure response generator has output adapter before generating
        if hasattr(self.response_generator, 'set_output_adapter'):
            self.response_generator.set_output_adapter(self.output_port)

        # Generate the response (this will stream chunks if a streaming adapter is used)
        response = self.response_generator.generate_response(
            prompt,
            self.model,
            self.tokenizer
        )

        # Add the complete response to history
        self._add_to_history(ChatMessage(role="assistant", content=response))

        # Update mentioned files based on response
        self._update_mentioned_files(response)

        # Return the complete response (important for history)
        return response

    def _update_mentioned_files(self, text: str):
        """Update the mentioned files set based on text content"""
        # Keep only 5 most recently mentioned files
        if len(self.mentioned_files) > 5:
            self.mentioned_files = set(list(self.mentioned_files)[-5:])

        # Add any files mentioned in the text
        for filename in self.project_files:
            if filename in text:
                self.mentioned_files.add(filename)

    def get_history(self):
        """Return conversation history"""
        return self.history

    def get_project_files(self):
        """Return all project files"""
        return self.project_files

    def get_file_content(self, filename: str) -> Optional[str]:
        """Get content of a specific file"""
        if filename in self.project_files:
            return self.project_files[filename].content
        return None

    def _add_to_history(self, message: ChatMessage):
        """Add a message to the conversation history, maintaining max length"""
        if len(self.history) >= self.config.max_history_length:
            self.history.pop(0)
        self.history.append(message)