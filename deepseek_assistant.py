from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
import torch
import argparse
import sys
import threading


def load_model():
    model = AutoModelForCausalLM.from_pretrained(
        "deepseek-ai/deepseek-coder-6.7b-instruct",
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
        device_map="auto"
    )
    tokenizer = AutoTokenizer.from_pretrained("deepseek-ai/deepseek-coder-6.7b-instruct")
    return model, tokenizer


def build_chat_prompt(history):
    prompt = ""
    for turn in history:
        if turn["role"] == "user":
            prompt += "User: " + turn["content"] + "\n"
        elif turn["role"] == "assistant":
            prompt += "Assistant: " + turn["content"] + "\n"
    prompt += "Assistant: "
    return prompt


def stream_generation(model, tokenizer, prompt):
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
    thread = threading.Thread(target=model.generate, kwargs={
        "input_ids": inputs["input_ids"],
        "max_new_tokens": 5000,
        "do_sample": True,
        "streamer": streamer
    })
    thread.start()
    generated_text = ""
    for new_text in streamer:
        print(new_text, end="", flush=True)
        generated_text += new_text
    thread.join()
    return generated_text


def read_java_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    except FileNotFoundError:
        print(f"\033[1;31mHata: {file_path} dosyası bulunamadı!\033[0m")
        sys.exit(1)
    except Exception as e:
        print(f"\033[1;31mOkuma hatası: {str(e)}\033[0m")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='Java Kod Analiz Chat Aracı')
    parser.add_argument('file', type=str, help='Analiz edilecek .java dosyasının yolu')
    args = parser.parse_args()

    java_code = read_java_file(args.file)
    model, tokenizer = load_model()

    # Sohbet geçmişini tutan liste (başlangıç mesajı)
    conversation_history = []
    initial_message = (
            "Refactor the original code according to SOLID principles. "
            "Write only the refactored code and do not write any explanation.\n"
            "### Original code:\n```java\n" + java_code + "\n```"
    )
    conversation_history.append({"role": "user", "content": initial_message})

    print(f"\n\033[1;34m{args.file} analiz ediliyor...\033[0m\n")
    print("Initial Response:\n")

    # İlk yanıtı üret
    prompt = build_chat_prompt(conversation_history)
    response = stream_generation(model, tokenizer, prompt)
    conversation_history.append({"role": "assistant", "content": response})

    # İnteraktif chat döngüsü
    while True:
        try:
            user_input = input("\nUser: ")
            if user_input.lower() in ["exit", "quit"]:
                break
            conversation_history.append({"role": "user", "content": user_input})
            prompt = build_chat_prompt(conversation_history)
            response = stream_generation(model, tokenizer, prompt)
            conversation_history.append({"role": "assistant", "content": response})
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
