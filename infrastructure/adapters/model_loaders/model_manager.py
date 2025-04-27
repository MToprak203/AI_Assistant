# infrastructure/adapters/model_loaders/model_manager.py
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import threading


class ModelManager:
    """
    Singleton class to manage model loading and caching.
    Loads the model once and provides access to it across the application.
    """
    _instance = None
    _model = None
    _tokenizer = None
    _is_initialized = False
    _is_initializing = False
    _init_lock = threading.Lock()
    _initialization_progress = 0

    def __new__(cls, *args, **kwargs):
        """Ensure singleton pattern"""
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
        return cls._instance

    def initialize(self, model_name="deepseek-ai/deepseek-coder-6.7b-instruct"):
        """Initialize and load the model and tokenizer"""
        # Use a lock to prevent concurrent initializations
        with self._init_lock:
            # Check if already initialized or initializing
            if self._is_initialized:
                print("Model already initialized, skipping initialization")
                return

            if self._is_initializing:
                print("Model initialization already in progress, skipping duplicate initialization")
                return

            print(f"Starting model initialization: {model_name}")
            self._is_initializing = True

        try:
            self._model = AutoModelForCausalLM.from_pretrained(
                model_name,
                torch_dtype=torch.bfloat16,
                trust_remote_code=True,
                device_map="auto"
            )

            self._tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                padding_side="left"
            )

            if self._tokenizer.pad_token is None:
                self._tokenizer.pad_token = self._tokenizer.eos_token

            with self._init_lock:
                self._is_initialized = True
                self._is_initializing = False
            print(f"Model {model_name} loaded successfully")
        except Exception as e:
            with self._init_lock:
                self._is_initializing = False
            print(f"Error loading model: {str(e)}")
            raise

    def get_model_and_tokenizer(self):
        """Get the loaded model and tokenizer"""
        if not self._is_initialized:
            raise ValueError("Model Manager not initialized. Call initialize() first.")
        return self._model, self._tokenizer

    def is_initialized(self):
        """Check if the model is initialized"""
        return self._is_initialized

    def is_initializing(self):
        """Check if the model is currently being initialized"""
        return self._is_initializing