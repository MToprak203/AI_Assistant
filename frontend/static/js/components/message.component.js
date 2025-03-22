// frontend/static/js/components/message.component.js

/**
 * Component for rendering chat messages
 */
const MessageComponent = (function() {
    // Private properties
    const messagesContainer = DomUtils.getById('messages');

    /**
     * Create a message avatar based on role
     * @param {string} role - Message role ('user' or 'assistant')
     * @returns {HTMLElement} Avatar container element
     */
    const createAvatar = function(role) {
        const avatarContainer = DomUtils.createElement('div', {}, 'flex-shrink-0 mr-4');

        const avatarClass = `h-8 w-8 rounded-full flex items-center justify-center ${
            role === 'user' ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'
        }`;

        const avatar = DomUtils.createElement('div', {}, avatarClass);
        avatar.innerHTML = role === 'user' ? 'U' : 'AI';

        DomUtils.appendChild(avatarContainer, avatar);
        return avatarContainer;
    };

    /**
     * Create a processing indicator
     * @returns {HTMLElement} Processing indicator element
     */
    const createProcessingIndicator = function() {
        const indicator = DomUtils.createElement('div', {
            id: 'processing-indicator'
        }, 'message-container bg-white');

        // Add avatar
        const avatarContainer = createAvatar('assistant');
        DomUtils.appendChild(indicator, avatarContainer);

        // Add content container
        const messageContent = DomUtils.createElement('div', {}, 'message-content flex items-center');

        // Add animated dots
        const dots = DomUtils.createElement('div', {
            id: 'streaming-dots'
        }, 'flex space-x-2');

        dots.innerHTML = `
            <div class="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0s"></div>
            <div class="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            <div class="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
        `;

        // Create streaming content container
        const streamingContent = DomUtils.createElement('div', {
            id: 'streaming-content'
        }, 'w-full mt-2');

        streamingContent.style.display = 'none'; // Hidden initially

        DomUtils.appendChild(messageContent, dots);
        DomUtils.appendChild(messageContent, streamingContent);
        DomUtils.appendChild(indicator, messageContent);

        return indicator;
    };

    return {
        /**
         * Add a message to the chat
         * @param {string} role - Message role ('user' or 'assistant')
         * @param {string} content - Message content
         * @returns {HTMLElement} The message element
         */
        addMessage: function(role, content) {
            // Remove processing indicator if it exists
            this.removeProcessingIndicator();

            // Create message container
            const messageDiv = DomUtils.createElement('div', {},
                `message-container ${role === 'user' ? 'bg-gray-50' : 'bg-white'}`);

            // Add avatar
            const avatarContainer = createAvatar(role);
            DomUtils.appendChild(messageDiv, avatarContainer);

            // Add message content
            const messageContent = DomUtils.createElement('div', {}, 'message-content');

            // Parse and render markdown
            MarkdownUtils.renderMarkdown(content, messageContent);

            DomUtils.appendChild(messageDiv, messageContent);
            DomUtils.appendChild(messagesContainer, messageDiv);

            // Scroll to bottom
            DomUtils.scrollToBottom(messagesContainer);

            return messageDiv;
        },

        /**
         * Add processing indicator
         * @returns {HTMLElement} The indicator element
         */
        addProcessingIndicator: function() {
            // Remove existing indicator if any
            this.removeProcessingIndicator();

            // Create and add new indicator
            const indicator = createProcessingIndicator();
            DomUtils.appendChild(messagesContainer, indicator);

            // Scroll to bottom
            DomUtils.scrollToBottom(messagesContainer);

            return indicator;
        },

        /**
         * Update streaming message with new content
         * @param {string} content - Message content
         */
        updateStreamingMessage: function(content) {
            const streamingContent = DomUtils.getById('streaming-content');
            const dots = DomUtils.getById('streaming-dots');

            if (streamingContent) {
                // Hide the dots and show the content on first update
                if (streamingContent.style.display === 'none') {
                    if (dots) dots.style.display = 'none';
                    streamingContent.style.display = 'block';
                }

                // Parse and render markdown
                MarkdownUtils.renderMarkdown(content, streamingContent);

                // Scroll to bottom
                DomUtils.scrollToBottom(messagesContainer);
            }
        },

        /**
         * Remove processing indicator
         */
        removeProcessingIndicator: function() {
            DomUtils.removeById('processing-indicator');
        },

        /**
         * Show error message
         * @param {string} message - Error message
         */
        showError: function(message) {
            const errorDiv = DomUtils.showError(message, messagesContainer, 5000);
            DomUtils.scrollToBottom(messagesContainer);
            return errorDiv;
        },

        /**
         * Clear all messages
         */
        clearMessages: function() {
            DomUtils.setHtml(messagesContainer, '');
        },

        /**
         * Get messages container
         * @returns {HTMLElement} Messages container
         */
        getMessagesContainer: function() {
            return messagesContainer;
        }
    };
})();