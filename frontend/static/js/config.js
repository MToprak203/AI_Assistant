// frontend/static/js/config.js

/**
 * Configuration settings for the application
 */
const AppConfig = (function() {
    // Private configuration values
    const config = {
        // API endpoints
        apiEndpoints: {
            sessions: '/api/sessions',
            upload: '/api/upload'
        },

        // Socket events
        socketEvents: {
            connect: 'connect',
            disconnect: 'disconnect',
            joinSession: 'join_session',
            sessionJoined: 'session_joined',
            userMessage: 'user_message',
            messageReceived: 'message_received',
            assistantChunk: 'assistant_chunk',
            assistantResponse: 'assistant_response',
            assistantResponseComplete: 'assistant_response_complete',
            error: 'error'
        },

        // UI configuration
        ui: {
            maxReconnectAttempts: 5,
            reconnectDelayMs: 1000,
            toastDurationMs: 3000
        }
    };

    // Public API
    return {
        /**
         * Get API endpoint URL
         * @param {string} endpoint - Endpoint name
         * @returns {string} The endpoint URL
         */
        getApiEndpoint: function(endpoint) {
            return config.apiEndpoints[endpoint];
        },

        /**
         * Get socket event name
         * @param {string} event - Event name
         * @returns {string} The socket event name
         */
        getSocketEvent: function(event) {
            return config.socketEvents[event];
        },

        /**
         * Get UI configuration value
         * @param {string} key - Configuration key
         * @returns {*} The configuration value
         */
        getUiConfig: function(key) {
            return config.ui[key];
        }
    };
})();