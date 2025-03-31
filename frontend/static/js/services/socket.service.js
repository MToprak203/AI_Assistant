// frontend/static/js/services/socket.service.js

/**
 * Service for handling Socket.IO communication
 */
const SocketService = (function() {
    // Private properties
    let socket = null;
    let sessionId = null;
    let reconnectAttempts = 0;
    let eventHandlers = {};
    const maxReconnectAttempts = AppConfig.getUiConfig('maxReconnectAttempts');

    // Private methods
    const resetReconnectAttempts = function() {
        reconnectAttempts = 0;
    };

    const setupEventHandlers = function() {
        // Connection events
        socket.on(AppConfig.getSocketEvent('connect'), () => {
            console.log('Socket connected');
            resetReconnectAttempts();

            // Only join session if we have a session ID
            if (sessionId) {
                joinSession(sessionId);
            }

            // Trigger any registered connect handlers
            triggerEvent('connect');
        });

        socket.on(AppConfig.getSocketEvent('disconnect'), () => {
            console.log('Socket disconnected');
            triggerEvent('disconnect');
            tryReconnect();
        });

        // Session events
        socket.on(AppConfig.getSocketEvent('sessionJoined'), (data) => {
            console.log('Session joined:', data);
            triggerEvent('sessionJoined', data);
        });

        // Message events
        socket.on(AppConfig.getSocketEvent('messageReceived'), (data) => {
            triggerEvent('messageReceived', data);
        });

        socket.on(AppConfig.getSocketEvent('assistantChunk'), (data) => {
            triggerEvent('assistantChunk', data);
        });

        socket.on(AppConfig.getSocketEvent('assistantResponse'), (data) => {
            triggerEvent('assistantResponse', data);
        });

        socket.on(AppConfig.getSocketEvent('assistantResponseComplete'), (data) => {
            triggerEvent('assistantResponseComplete', data);
        });

        // Project update events
        socket.on(AppConfig.getSocketEvent('project_update_result'), (data) => {
            triggerEvent('project_update_result', data);
        });

        // Error events
        socket.on(AppConfig.getSocketEvent('error'), (data) => {
            console.error('Socket error:', data);
            triggerEvent('error', data);
        });
    };

    const tryReconnect = function() {
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);

            setTimeout(() => {
                connect();
            }, AppConfig.getUiConfig('reconnectDelayMs') * reconnectAttempts);
        } else {
            triggerEvent('maxReconnectAttemptsReached');
        }
    };

    const joinSession = function(sid) {
        if (!socket || !socket.connected) {
            return false;
        }

        socket.emit(AppConfig.getSocketEvent('joinSession'), { session_id: sid });
        return true;
    };

    const triggerEvent = function(event, data) {
        if (eventHandlers[event]) {
            eventHandlers[event].forEach(handler => handler(data));
        }
    };

    // Public API
    return {
        /**
         * Initialize and connect socket
         * @returns {Object} The socket service instance (for chaining)
         */
        connect: function() {
            if (!socket) {
                socket = io();
                setupEventHandlers();
            } else if (!socket.connected) {
                socket.connect();
            }

            return this;
        },

        /**
         * Disconnect socket
         */
        disconnect: function() {
            if (socket && socket.connected) {
                socket.disconnect();
            }
        },

        /**
         * Set session ID and join session
         * @param {string} sid - Session ID
         * @returns {boolean} True if join request sent, false otherwise
         */
        setSessionId: function(sid) {
            sessionId = sid;
            return joinSession(sid);
        },

        /**
         * Get current session ID
         * @returns {string|null} Current session ID
         */
        getSessionId: function() {
            return sessionId;
        },

        /**
         * Send a message
         * @param {string} event - Event name
         * @param {Object} data - Data to send
         * @returns {boolean} True if sent, false otherwise
         */
        emit: function(event, data) {
            if (!socket || !socket.connected) {
                console.warn('Socket not connected, cannot emit event:', event);
                return false;
            }

            socket.emit(event, data);
            return true;
        },

        /**
         * Send a user message
         * @param {string} message - Message content
         * @param {string|null} filePath - Optional file path
         * @param {string|null} fileFocus - Optional primary file to focus on
         * @returns {boolean} True if sent, false otherwise
         */
        sendMessage: function(message, filePath = null, fileFocus = null) {
            if (!sessionId) {
                console.error('No session ID, cannot send message');
                return false;
            }

            return this.emit(AppConfig.getSocketEvent('userMessage'), {
                session_id: sessionId,
                message: message,
                file_path: filePath,
                file_focus: fileFocus
            });
        },

        /**
         * Send project update
         * @param {Object} data - Project update data
         * @returns {boolean} True if sent, false otherwise
         */
        sendProjectUpdate: function(data) {
            if (!sessionId) {
                console.error('No session ID, cannot send project update');
                return false;
            }

            data.session_id = sessionId;
            return this.emit(AppConfig.getSocketEvent('projectUpdate'), data);
        },

        /**
         * Register event handler
         * @param {string} event - Event name
         * @param {Function} handler - Event handler function
         */
        on: function(event, handler) {
            if (!eventHandlers[event]) {
                eventHandlers[event] = [];
            }

            eventHandlers[event].push(handler);
        },

        /**
         * Remove event handler
         * @param {string} event - Event name
         * @param {Function} [handler] - Event handler function (remove all handlers if not provided)
         */
        off: function(event, handler) {
            if (!eventHandlers[event]) {
                return;
            }

            if (!handler) {
                // Remove all handlers for this event
                delete eventHandlers[event];
            } else {
                // Remove specific handler
                eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
            }
        },

        /**
         * Check if socket is connected
         * @returns {boolean} True if connected, false otherwise
         */
        isConnected: function() {
            return socket && socket.connected;
        }
    };
})();