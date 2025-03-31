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
        },

        /**
         * Upload multiple files
         * @param {FormData} formData - FormData containing files
         * @returns {Promise<Object>} Promise resolving to upload results
         */
        uploadMultipleFiles: async function(formData) {
            try {
                const response = await fetch(AppConfig.getApiEndpoint('multiUpload'), {
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
        },

        /**
         * Get project files
         * @returns {Promise<Object>} Promise resolving to project files data
         */
        getProjectFiles: async function() {
            try {
                const response = await fetch(AppConfig.getApiEndpoint('project'), {
                    method: 'GET'
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
         * Get content of a specific project file
         * @param {string} filename - Name of the file to get
         * @returns {Promise<Object>} Promise resolving to file content
         */
        getFileContent: async function(filename) {
            try {
                const response = await fetch(`${AppConfig.getApiEndpoint('projectFile')}/${encodeURIComponent(filename)}`, {
                    method: 'GET'
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