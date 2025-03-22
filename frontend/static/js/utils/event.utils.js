// frontend/static/js/utils/event.utils.js

/**
 * Utility functions for event handling
 */
const EventUtils = (function() {
    // Private properties
    const observers = {};

    return {
        /**
         * Register an event observer
         * @param {string} eventType - Event type
         * @param {Function} callback - Observer callback
         * @returns {Object} Observer handle for unsubscribing
         */
        subscribe: function(eventType, callback) {
            // Initialize observer array if needed
            if (!observers[eventType]) {
                observers[eventType] = [];
            }

            // Add observer
            observers[eventType].push(callback);

            // Return handle for unsubscribing
            return {
                unsubscribe: function() {
                    EventUtils.unsubscribe(eventType, callback);
                }
            };
        },

        /**
         * Remove an event observer
         * @param {string} eventType - Event type
         * @param {Function} callback - Observer callback to remove
         */
        unsubscribe: function(eventType, callback) {
            if (!observers[eventType]) {
                return;
            }

            observers[eventType] = observers[eventType].filter(
                observer => observer !== callback
            );
        },

        /**
         * Publish an event
         * @param {string} eventType - Event type
         * @param {*} data - Event data
         */
        publish: function(eventType, data) {
            if (!observers[eventType]) {
                return;
            }

            observers[eventType].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event handler for ${eventType}:`, error);
                }
            });
        },

        /**
         * Create a debounced function
         * @param {Function} func - Function to debounce
         * @param {number} wait - Debounce wait time in milliseconds
         * @returns {Function} Debounced function
         */
        debounce: function(func, wait) {
            let timeout;

            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };

                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Create a throttled function
         * @param {Function} func - Function to throttle
         * @param {number} limit - Throttle limit in milliseconds
         * @returns {Function} Throttled function
         */
        throttle: function(func, limit) {
            let inThrottle;

            return function(...args) {
                if (!inThrottle) {
                    func(...args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }
    };
})();