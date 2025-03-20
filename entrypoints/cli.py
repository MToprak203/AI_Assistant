# entrypoints/cli.py
import argparse

from infrastructure.di.container import Container


def main():
    container = Container()
    container.config.from_dict({
        "max_history_length": 10,
        "default_temp": 0.7,
        "model_name": "deepseek-ai/deepseek-coder-6.7b-instruct"
    })

    parser = argparse.ArgumentParser(description='AI Code Assistant')
    parser.add_argument('file', type=str, help='Path to the code file')
    args = parser.parse_args()

    # Resolve dependencies
    file_handler = container.file_handler()
    model_loader = container.model_loader()
    conversation_uc = container.conversation_uc()
    output_port = container.chat_output()

    try:
        # 1. Read code file
        code = file_handler.read_file(args.file)

        # 2. Initialize conversation with code
        conversation_uc.initialize_with_code(code)

        # 3. Start conversation with automatic analysis
        output_port.display_message(f"\nAnalyzing {args.file}...\n")
        conversation_uc.handle_conversation(model_loader)

    except Exception as e:
        output_port.display_message(f"Error: {str(e)}")

if __name__ == '__main__':
    main()