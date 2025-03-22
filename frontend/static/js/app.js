// frontend/static/js/app.js

/**
 * Main application entry point
 */
const App = (function() {
    // Private properties
    let sessionId = null;

    /**
     * Initialize the application
     */
    const init = async function() {
        try {
            // Initialize components
            FileUploadComponent.init();
            ChatComponent.init();

            // Connect to socket
            SocketService.connect();

            // Create session
            await createSession();

            // Publish initialization event
            EventUtils.publish('appInitialized', {});
        } catch (error) {
            console.error('Failed to initialize application:', error);
            MessageComponent.showError('Failed to initialize: ' + error.message);
        }
    };

    /**
     * Create a new chat session
     */
    const createSession = async function() {
        try {
            // Create session via API
            const data = await ApiService.createSession();
            sessionId = data.session_id;

            // Set session ID in socket service
            SocketService.setSessionId(sessionId);

            // Publish session initialized event
            EventUtils.publish('sessionInitialized', { sessionId });

            return sessionId;
        } catch (error) {
            console.error('Failed to create session:', error);
            throw new Error('Failed to create session: ' + error.message);
        }
    };

    return {
        /**
         * Initialize the application
         */
        init: init,

        /**
         * Get current session ID
         * @returns {string|null} Current session ID
         */
        getSessionId: function() {
            return sessionId;
        }
    };
})();

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});