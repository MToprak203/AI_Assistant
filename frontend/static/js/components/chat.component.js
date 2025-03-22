// frontend/static/js/components/chat.component.js

/**
 * Component for handling chat functionality
 */
const ChatComponent = (function() {
    // Private properties
    const messageInput = DomUtils.getById('message-input');
    const sendButton = DomUtils.getById('send-btn');
    let isProcessing = false;
    let currentStreamingMessage = null;

    /**
     * Initialize the component
     */
    const init = function() {
        // Setup event listeners
        DomUtils.addEvent(sendButton, 'click', sendMessage);

        // Handle Enter key (but allow Shift+Enter for new lines)
        DomUtils.addEvent(messageInput, 'keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Setup socket event handlers
        setupSocketEvents();

        // Subscribe to events
        EventUtils.subscribe('sessionInitialized', data => {
            console.log('Session initialized:', data);
        });
    };

    /**
     * Set up socket event handlers
     */
    const setupSocketEvents = function() {
        SocketService.on('connect', () => {
            console.log('Socket connected, ready for chat');
        });

        SocketService.on('disconnect', () => {
            console.log('Socket disconnected');
        });

        SocketService.on('messageReceived', (data) => {
            if (data.status === 'processing') {
                isProcessing = true;

                // Create an empty container for streaming response
                MessageComponent.addProcessingIndicator();

                // Initialize an empty streaming message container
                currentStreamingMessage = '';
            }
        });

        SocketService.on('assistantChunk', (data) => {
            if (currentStreamingMessage !== null) {
                // Append new chunk to current message
                currentStreamingMessage += data.content;

                // Update the streaming message container
                MessageComponent.updateStreamingMessage(currentStreamingMessage);
            }
        });

        SocketService.on('assistantResponse', (data) => {
            if (data.complete) {
                console.log('Handling complete message (non-streaming)');
                isProcessing = false;

                // This is a complete message (not a chunk)
                MessageComponent.removeProcessingIndicator();
                MessageComponent.addMessage('assistant', data.content);
                currentStreamingMessage = null;
            }
        });

        SocketService.on('assistantResponseComplete', (data) => {
            console.log('Response complete, finalizing message');
            isProcessing = false;

            // This is the critical part - ensure we have message content
            if (currentStreamingMessage && currentStreamingMessage.trim().length > 0) {
                // Store the message content in a local variable to ensure it doesn't get cleared
                const messageContent = currentStreamingMessage;

                // Convert the streaming message container to a proper message
                MessageComponent.removeProcessingIndicator();
                MessageComponent.addMessage('assistant', messageContent);
            } else {
                console.log('Warning: No streaming message content to finalize');
                MessageComponent.removeProcessingIndicator();
            }

            // Reset streaming message state after finalizing
            currentStreamingMessage = null;
        });

        SocketService.on('error', (data) => {
            isProcessing = false;
            MessageComponent.removeProcessingIndicator();
            currentStreamingMessage = null;
            MessageComponent.showError(data.message);
        });

        SocketService.on('maxReconnectAttemptsReached', () => {
            MessageComponent.showError('Lost connection to server. Please refresh the page.');
        });
    };

    /**
     * Send a message
     */
    const sendMessage = function() {
        const message = messageInput.value.trim();
        if (!message || isProcessing) return;

        // Ensure socket is connected
        if (!SocketService.isConnected()) {
            console.log('Socket not connected, attempting to reconnect...');
            SocketService.connect();
            MessageComponent.showError('Connection to server lost. Trying to reconnect...');
            return;
        }

        // Add message to UI
        MessageComponent.addMessage('user', message);

        // Clear input
        messageInput.value = '';

        // Get file path if a file is uploaded
        const filePath = FileUploadComponent.getFilePath();

        // Send message via socket
        SocketService.sendMessage(message, filePath);
    };

    return {
        /**
         * Initialize the component
         */
        init: init,

        /**
         * Check if processing a response
         * @returns {boolean} True if processing
         */
        isProcessing: function() {
            return isProcessing;
        },

        /**
         * Get message input element
         * @returns {HTMLElement} Message input element
         */
        getMessageInput: function() {
            return messageInput;
        },

        /**
         * Focus on message input
         */
        focusInput: function() {
            messageInput.focus();
        },

        /**
         * Clear message input
         */
        clearInput: function() {
            messageInput.value = '';
        }
    };
})();