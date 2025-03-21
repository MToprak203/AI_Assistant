# infrastructure/adapters/response_generators/streaming_adapter.py
from transformers import TextIteratorStreamer
from threading import Thread

from core.ports.response_generator_port import ResponseGeneratorPort


class StreamingResponseAdapter(ResponseGeneratorPort):
    def __init__(self):
        self.output_adapter = None

    def set_output_adapter(self, output_adapter):
        """Set the output adapter to use for streaming chunks"""
        self.output_adapter = output_adapter

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

        # Collect the complete generated text
        complete_response = ""

        for new_text in streamer:
            # Print to console if running in CLI mode
            print(new_text, end="", flush=True)

            # Stream to client if output adapter is available
            if self.output_adapter and hasattr(self.output_adapter, 'stream_chunk'):
                self.output_adapter.stream_chunk(new_text)

            # Build up the complete response
            complete_response += new_text

        thread.join()

        # Log the full response length for debugging
        print(f"Complete response generated, length: {len(complete_response)}")

        return complete_response