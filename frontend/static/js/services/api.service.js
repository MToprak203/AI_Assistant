// frontend/static/js/services/api.service.js

/**
 * Service for handling API calls
 */
const ApiService = (function() {
    // Private methods and properties
    const errorHandler = function(error) {
        console.error('API Error:', error);
        return Promise.reject(error);
    };

    // Public API
    return {
        /**
         * Create a new chat session
         * @returns {Promise<Object>} Promise resolving to session data
         */
        createSession: async function() {
            try {
                const response = await fetch(AppConfig.getApiEndpoint('sessions'), {
                    method: 'POST'
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                return errorHandler(error);
            }
        },

        /**
         * Upload a file
         * @param {File} file - The file to upload
         * @returns {Promise<Object>} Promise resolving to upload result
         */
        uploadFile: async function(file) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(AppConfig.getApiEndpoint('upload'), {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                return errorHandler(error);
            }
        }
    };
})();