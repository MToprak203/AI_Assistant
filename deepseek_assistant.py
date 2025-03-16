from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
import torch
import argparse
import sys
import threading


def load_model():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModelForCausalLM.from_pretrained(
        "deepseek-ai/deepseek-coder-6.7b-instruct",
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
        device_map="auto"
    )
    tokenizer = AutoTokenizer.from_pretrained("deepseek-ai/deepseek-coder-6.7b-instruct")
    return model, tokenizer


def analyze_java_code(model, tokenizer, code):
    prompt = f"""
    Refactor the original code according to SOLID principles. Write only the refactored code and do not write any explanation.
    
    ### Original code:
    ```java
    {code}
    """

    # Girdi tokenlarına çevir
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    # Streaming için TextIteratorStreamer kullanıyoruz.
    # skip_prompt=True ile prompt kısmının üretilen çıktıda yer almasını engelliyoruz.
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

    # model.generate'i ayrı bir thread'de çalıştırıyoruz.
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
    parser = argparse.ArgumentParser(description='Java Kod Analiz Aracı')
    parser.add_argument('file', type=str, help='Analiz edilecek .java dosyasının yolu')
    args = parser.parse_args()

    java_code = read_java_file(args.file)
    model, tokenizer = load_model()

    print(f"\n\033[1;34m{args.file} analiz ediliyor...\033[0m\n")

    analysis = analyze_java_code(model, tokenizer, java_code)

    print("\n\033[1;36m### Analiz Sonuçları:\033[0m")
    print(analysis)


if __name__ == "__main__":
    main()