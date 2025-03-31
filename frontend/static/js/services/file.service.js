// frontend/static/js/services/file.service.js

/**
 * Service for handling file uploads
 */
const FileService = (function() {
    // Private properties
    let currentFilePath = null;
    let currentFileName = null;
    let observers = [];

    // Private methods
    const notifyObservers = function(eventType, data) {
        observers.forEach(observer => {
            if (typeof observer[eventType] === 'function') {
                observer[eventType](data);
            }
        });
    };

    // Public API
    return {
        /**
         * Upload a file
         * @param {File} file - The file to upload
         * @returns {Promise<Object>} Promise resolving to upload result
         */
        uploadFile: async function(file) {
            try {
                // Notify observers that upload has started
                notifyObservers('onUploadStart', { fileName: file.name });

                // Call API service to upload file
                const response = await ApiService.uploadFile(file);

                if (response.error) {
                    throw new Error(response.error);
                }

                // Update current file info
                currentFilePath = response.file_path;
                currentFileName = response.filename;

                // Notify observers of successful upload
                notifyObservers('onUploadSuccess', {
                    filePath: currentFilePath,
                    fileName: currentFileName,
                    originalName: file.name
                });

                return response;
            } catch (error) {
                // Notify observers of upload error
                notifyObservers('onUploadError', { error: error.message });
                throw error;
            }
        },

        /**
         * Upload multiple files
         * @param {Array<File>} files - Array of files to upload
         * @returns {Promise<Object>} Promise resolving to upload results
         */
        uploadMultipleFiles: async function(files, filePaths = new Map()) {
            try {
                // Notify observers that upload has started
                notifyObservers('onUploadStart', { fileName: `${files.length} files` });

                // Create form data with multiple files
                const formData = new FormData();

                // Add each file with its path information
                files.forEach(file => {
                    formData.append('files[]', file);
                    // Add the relative path if available
                    if (filePaths.has(file) && filePaths.get(file)) {
                        formData.append('paths[]', filePaths.get(file));
                    }
                });

                // Call API to upload multiple files
                const response = await ApiService.uploadMultipleFiles(formData);

                if (response.error) {
                    throw new Error(response.error);
                }

                // Notify observers of successful upload
                notifyObservers('onMultiUploadSuccess', {
                    files: response.files,
                    count: response.count,
                    processed: response.processed,
                    skipped: response.skipped
                });

                return response;
            } catch (error) {
                // Notify observers of upload error
                notifyObservers('onUploadError', { error: error.message });
                throw error;
            }
        },

        /**
         * Clear current file
         */
        clearFile: function() {
            const prevFilePath = currentFilePath;
            const prevFileName = currentFileName;

            currentFilePath = null;
            currentFileName = null;

            // Notify observers that file has been cleared
            notifyObservers('onFileClear', {
                filePath: prevFilePath,
                fileName: prevFileName
            });
        },

        /**
         * Get current file path
         * @returns {string|null} Current file path
         */
        getCurrentFilePath: function() {
            return currentFilePath;
        },

        /**
         * Get current file name
         * @returns {string|null} Current file name
         */
        getCurrentFileName: function() {
            return currentFileName;
        },

        /**
         * Register an observer for file events
         * @param {Object} observer - Observer object with event handler methods
         */
        addObserver: function(observer) {
            observers.push(observer);
        },

        /**
         * Remove an observer
         * @param {Object} observer - Observer to remove
         */
        removeObserver: function(observer) {
            observers = observers.filter(obs => obs !== observer);
        }
    };
})();