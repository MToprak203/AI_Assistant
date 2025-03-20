# infrastructure/adapters/model_loaders/huggingface_adapter.py
from core.ports.model_loader_port import ModelLoaderPort
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch


class HuggingFaceModelAdapter(ModelLoaderPort):
    def load_model(self) -> AutoModelForCausalLM:
        return AutoModelForCausalLM.from_pretrained(
            "deepseek-ai/deepseek-coder-6.7b-instruct",
            torch_dtype=torch.bfloat16,
            trust_remote_code=True,
            device_map="auto"
        )

    def load_tokenizer(self) -> AutoTokenizer:
        tokenizer = AutoTokenizer.from_pretrained(
            "deepseek-ai/deepseek-coder-6.7b-instruct",
            padding_side="left"  # Important for generation
        )

        # Set pad token if not exists
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        return tokenizer