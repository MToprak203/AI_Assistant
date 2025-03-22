# entrypoints/cli.py
import argparse

from infrastructure.di.container import Container


def main():
    container = Container()
    container.config.from_dict({
        "context": "cli",
        "max_history_length": 10,
        "default_temp": 0.7,
        "model_name": "deepseek-ai/deepseek-coder-6.7b-instruct"
    })

    parser = argparse.ArgumentParser(description='AI Code Assistant')
    parser.add_argument('file', type=str, help='Path to the code file')
    args = parser.parse_args()

    # Initialize the model during startup - only once
    print("Initializing model...")
    container.initialize_model()
    model_manager = container.model_manager()
    model, tokenizer = model_manager.get_model_and_tokenizer()
    print("Model initialized successfully!")

    # Resolve dependencies
    file_handler = container.file_handler()
    conversation_uc = container.conversation_uc()
    output_port = container.chat_output()

    # Set model and tokenizer directly
    conversation_uc.set_model_and_tokenizer(model, tokenizer)

    try:
        # 1. Read code file
        code = file_handler.read_file(args.file)

        # 2. Initialize conversation with code
        conversation_uc.initialize_with_code(code)

        # 3. Start conversation loop
        output_port.display_message(f"\nAnalyzing {args.file}...\n")

        # Interactive conversation loop
        while True:
            user_input = output_port.get_user_input("\nYou: ")
            if user_input.lower() in ["exit", "quit", "bye"]:
                output_port.display_message("Goodbye!")
                break

            # No need to pass model_loader as we've already set the model and tokenizer
            response = conversation_uc.handle_message(user_input)
            output_port.display_message(f"\nAssistant: {response}")

    except Exception as e:
        output_port.display_message(f"Error: {str(e)}")

if __name__ == '__main__':
    main()