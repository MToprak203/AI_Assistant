// frontend/static/js/utils/dom.utils.js

/**
 * Utility functions for DOM manipulation
 */
const DomUtils = (function () {
    return {
        /**
         * Get element by ID
         * @param {string} id - Element ID
         * @returns {HTMLElement|null} The element or null if not found
         */
        getById: function (id) {
            return document.getElementById(id);
        },

        /**
         * Create an element with attributes and classes
         * @param {string} tag - HTML tag name
         * @param {Object} [attributes] - Element attributes
         * @param {string|string[]} [classes] - CSS classes to add
         * @returns {HTMLElement} The created element
         */
        createElement: function (tag, attributes = {}, classes = []) {
            const element = document.createElement(tag);

            // Add attributes
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });

            // Add classes
            if (typeof classes === 'string') {
                element.className = classes;
            } else if (Array.isArray(classes)) {
                element.className = classes.join(' ');
            }

            return element;
        },

        /**
         * Append a child element
         * @param {HTMLElement} parent - Parent element
         * @param {HTMLElement} child - Child element
         * @returns {HTMLElement} The child element
         */
        appendChild: function (parent, child) {
            return parent.appendChild(child);
        },

        /**
         * Remove an element
         * @param {HTMLElement} element - Element to remove
         */
        removeElement: function (element) {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        },

        /**
         * Remove element by ID
         * @param {string} id - Element ID
         */
        removeById: function (id) {
            const element = this.getById(id);
            this.removeElement(element);
        },

        /**
         * Show an element
         * @param {HTMLElement|string} element - Element or element ID
         */
        showElement: function (element) {
            const el = typeof element === 'string' ? this.getById(element) : element;

            if (el) {
                el.classList.remove('hidden');
            }
        },

        /**
         * Hide an element
         * @param {HTMLElement|string} element - Element or element ID
         */
        hideElement: function (element) {
            const el = typeof element === 'string' ? this.getById(element) : element;

            if (el) {
                el.classList.add('hidden');
            }
        },

        /**
         * Set element text content
         * @param {HTMLElement|string} element - Element or element ID
         * @param {string} text - Text content
         */
        setText: function (element, text) {
            const el = typeof element === 'string' ? this.getById(element) : element;

            if (el) {
                el.textContent = text;
            }
        },

        /**
         * Set element HTML content
         * @param {HTMLElement|string} element - Element or element ID
         * @param {string} html - HTML content
         */
        setHtml: function (element, html) {
            const el = typeof element === 'string' ? this.getById(element) : element;

            if (el) {
                el.innerHTML = html;
            }
        },

        /**
         * Create and show a toast message
         * @param {string} message - Toast message
         * @param {string} [type] - Toast type ('success', 'warning', 'error')
         * @param {number} [duration] - Duration in milliseconds
         */
        showToast: function (message, type = 'success', duration = AppConfig.getUiConfig('toastDurationMs')) {
            // Clean up any existing toasts to prevent overlapping
            const existingToasts = document.querySelectorAll('.toast');
            existingToasts.forEach(toast => {
                this.removeElement(toast);
            });

            // Create the toast with the appropriate class based on type
            const toast = this.createElement('div', {}, 'toast');

            // Add type-specific class
            if (type === 'error') {
                toast.classList.add('toast-error');
            } else if (type === 'warning') {
                toast.classList.add('toast-warning');
            } else {
                toast.classList.add('toast-success');
            }

            // Set the message
            toast.textContent = message;

            // Add to the document
            document.body.appendChild(toast);

            // Force layout reflow to enable animation
            toast.offsetHeight;

            // Add animation class
            toast.classList.add('animate-toast');

            // Set timeout to remove the toast
            setTimeout(() => {
                // Add fade-out class
                toast.classList.add('toast-fade-out');

                // Remove after animation completes
                setTimeout(() => {
                    this.removeElement(toast);
                }, 300);
            }, duration);
        },

        /**
         * Show an error message
         * @param {string} message - Error message
         * @param {HTMLElement} [container] - Container element (body if not provided)
         * @param {number} [duration] - Duration in milliseconds (0 for permanent)
         */
        showError: function (message, container = null, duration = 5000) {
            const errorDiv = this.createElement('div', {},
                'bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded');

            const errorText = this.createElement('p');
            errorText.textContent = message;

            this.appendChild(errorDiv, errorText);

            const targetContainer = container || document.body;
            this.appendChild(targetContainer, errorDiv);

            if (duration > 0) {
                setTimeout(() => {
                    this.removeElement(errorDiv);
                }, duration);
            }

            return errorDiv;
        },

        /**
         * Scroll an element to the bottom
         * @param {HTMLElement|string} element - Element or element ID
         */
        scrollToBottom: function (element) {
            const el = typeof element === 'string' ? this.getById(element) : element;

            if (el) {
                el.scrollTop = el.scrollHeight;
            }
        },

        /**
         * Add event listener
         * @param {HTMLElement|string} element - Element or element ID
         * @param {string} event - Event name
         * @param {Function} handler - Event handler
         */
        addEvent: function (element, event, handler) {
            const el = typeof element === 'string' ? this.getById(element) : element;

            if (el) {
                el.addEventListener(event, handler);
            }
        }
    }
})();