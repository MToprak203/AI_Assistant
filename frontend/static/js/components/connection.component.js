// frontend/static/js/components/connection.component.js
const ConnectionComponent = (function() {
    // Private properties
    let statusElement = null;
    let isConnected = false;

    /**
     * Initialize the component
     */
    const init = function() {
        // Create status element
        createStatusElement();

        // Subscribe to socket status events
        if (ElectronService.isElectron()) {
            EventUtils.subscribe('socketStatus', handleSocketStatus);
        } else {
            // For web version, listen to socket events directly
            SocketService.on('connect', () => updateStatus(true));
            SocketService.on('disconnect', () => updateStatus(false));
        }
    };

    /**
     * Create the status element in the UI
     */
    const createStatusElement = function() {
        // Create container for the status indicator
        statusElement = DomUtils.createElement('div', {
            id: 'connection-status',
            title: 'Backend connection status'
        }, 'fixed bottom-2 right-2 p-2 bg-white rounded-full shadow-md flex items-center');

        // Add status indicator
        const indicator = DomUtils.createElement('div', {
            id: 'connection-indicator'
        }, 'w-3 h-3 rounded-full bg-red-500');

        // Add to the container
        DomUtils.appendChild(statusElement, indicator);

        // Add to the document body
        document.body.appendChild(statusElement);

        // Set initial status
        updateStatus(false);
    };

    /**
     * Handle socket status update
     * @param {Object} status - Socket status object
     */
    const handleSocketStatus = function(status) {
        updateStatus(status.connected);

        if (!status.connected && status.error) {
            DomUtils.showToast(`Connection error: ${status.error}`, 'error', 3000);
        }
    };

    /**
     * Update the status indicator
     * @param {boolean} connected - Whether connected to the backend
     */
    const updateStatus = function(connected) {
        if (!statusElement) return;

        const indicator = statusElement.querySelector('#connection-indicator');
        if (!indicator) return;

        if (connected) {
            indicator.classList.remove('bg-red-500');
            indicator.classList.add('bg-green-500');
            statusElement.setAttribute('title', 'Connected to backend');
        } else {
            indicator.classList.remove('bg-green-500');
            indicator.classList.add('bg-red-500');
            statusElement.setAttribute('title', 'Disconnected from backend');
        }

        isConnected = connected;
    };

    return {
        /**
         * Initialize the component
         */
        init: init,

        /**
         * Check if connected to backend
         * @returns {boolean} Connection status
         */
        isConnected: function() {
            return isConnected;
        }
    };
})();

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
    ConnectionComponent.init();
});