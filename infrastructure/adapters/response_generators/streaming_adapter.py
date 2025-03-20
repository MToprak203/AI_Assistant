# infrastructure/adapters/response_generators/streaming_adapter.py
from transformers import TextIteratorStreamer
from threading import Thread

from core.ports.response_generator_port import ResponseGeneratorPort


class StreamingResponseAdapter(ResponseGeneratorPort):
    def generate_response(self, prompt: str, model, tokenizer) -> str:
        # Tokenize with attention mask
        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            padding=True,
            truncation=True,
            return_attention_mask=True
        ).to(model.device)

        # Configure streamer
        streamer = TextIteratorStreamer(
            tokenizer,
            skip_prompt=True,
            skip_special_tokens=True
        )

        # Get pad token (use eos_token if not defined)
        pad_token = tokenizer.pad_token_id or tokenizer.eos_token_id

        generation_kwargs = dict(
            input_ids=inputs.input_ids,
            attention_mask=inputs.attention_mask,  # Add attention mask
            max_new_tokens=5000,
            do_sample=True,
            pad_token_id=pad_token,  # Explicitly set pad token
            streamer=streamer
        )

        thread = Thread(target=model.generate, kwargs=generation_kwargs)
        thread.start()

        generated_text = ""
        for new_text in streamer:
            print(new_text, end="", flush=True)
            generated_text += new_text

        thread.join()
        return generated_text