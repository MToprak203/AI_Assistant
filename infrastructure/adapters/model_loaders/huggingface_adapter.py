# infrastructure/adapters/model_loaders/huggingface_adapter.py
from core.ports.model_loader_port import ModelLoaderPort
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch


class HuggingFaceModelAdapter(ModelLoaderPort):
    def __init__(self, model_name: str = "deepseek-ai/deepseek-coder-6.7b-instruct"):
        self.model_name = model_name

    def load_model_and_tokenizer(self):
        model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            torch_dtype=torch.bfloat16,
            trust_remote_code=True,
            device_map="auto"
        )

        tokenizer = AutoTokenizer.from_pretrained(
            self.model_name,
            padding_side="left"
        )

        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        return model, tokenizer