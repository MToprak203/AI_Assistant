// frontend/static/js/components/fileUpload.component.js

/**
 * Component for handling file uploads
 */
const FileUploadComponent = (function() {
    // Private properties
    const fileUploadInput = DomUtils.getById('file-upload');
    const uploadButton = DomUtils.getById('upload-btn');
    const fileInfo = DomUtils.getById('file-info');
    const fileName = DomUtils.getById('file-name');
    const clearFileBtn = DomUtils.getById('clear-file');

    /**
     * Initialize the component
     */
    const init = function() {
        // Setup event listeners
        DomUtils.addEvent(fileUploadInput, 'change', handleFileChange);
        DomUtils.addEvent(uploadButton, 'click', triggerFileDialog);
        DomUtils.addEvent(clearFileBtn, 'click', clearFile);

        // Register as observer for FileService events
        FileService.addObserver({
            onUploadStart: handleUploadStart,
            onUploadSuccess: handleUploadSuccess,
            onUploadError: handleUploadError,
            onFileClear: handleFileClear
        });
    };

    /**
     * Trigger file input dialog
     */
    const triggerFileDialog = function() {
        fileUploadInput.click();
    };

    /**
     * Handle file selection
     * @param {Event} event - Change event
     */
    const handleFileChange = function(event) {
        if (event.target.files.length > 0) {
            const file = event.target.files[0];
            uploadFile(file);
        }
    };

    /**
     * Upload a file
     * @param {File} file - File to upload
     */
    const uploadFile = function(file) {
        FileService.uploadFile(file)
            .catch(error => {
                console.error('Upload error:', error);
                // Error handling is done in the observer
            });
    };

    /**
     * Clear current file
     */
    const clearFile = function() {
        FileService.clearFile();
    };

    /**
     * Handle upload start event
     * @param {Object} data - Event data
     */
    const handleUploadStart = function(data) {
        // Show uploading toast
        DomUtils.showToast('Uploading file...');
    };

    /**
     * Handle upload success event
     * @param {Object} data - Event data
     */
    const handleUploadSuccess = function(data) {
        // Update UI with file info
        DomUtils.setText(fileName, data.fileName);
        DomUtils.showElement(fileInfo);

        // Show success message
        DomUtils.showToast(`File uploaded: ${data.fileName}`);

        // Publish file upload success event
        EventUtils.publish('fileUploaded', data);
    };

    /**
     * Handle upload error event
     * @param {Object} data - Event data
     */
    const handleUploadError = function(data) {
        DomUtils.showError(data.error);
    };

    /**
     * Handle file clear event
     */
    const handleFileClear = function() {
        // Reset UI
        DomUtils.hideElement(fileInfo);
        DomUtils.setText(fileName, '');
        fileUploadInput.value = '';

        // Publish file cleared event
        EventUtils.publish('fileCleared', {});
    };

    return {
        /**
         * Initialize the component
         */
        init: init,

        /**
         * Check if a file is selected
         * @returns {boolean} True if a file is selected
         */
        hasFile: function() {
            return FileService.getCurrentFilePath() !== null;
        },

        /**
         * Get current file path
         * @returns {string|null} Current file path
         */
        getFilePath: function() {
            return FileService.getCurrentFilePath();
        },

        /**
         * Get current file name
         * @returns {string|null} Current file name
         */
        getFileName: function() {
            return FileService.getCurrentFileName();
        }
    };
})();