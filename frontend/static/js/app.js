// frontend/static/js/app.js

/**
 * Main application entry point
 */
const App = (function() {
    // Private properties
    let sessionId = null;

    // UI element references
    const collapseFilesBtn = DomUtils.getById('collapse-files-btn');
    const expandFilesBtn = DomUtils.getById('expand-files-btn');
    const projectFilesContainer = DomUtils.getById('project-files-container');

    /**
     * Initialize the application
     */
    const init = async function() {
        try {
            // Initialize components
            FileUploadComponent.init();
            ChatComponent.init();

            // Initialize UI event handlers
            initUIEventHandlers();

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
     * Initialize UI event handlers
     */
    const initUIEventHandlers = function() {
        // Handle project files panel collapse
        if (collapseFilesBtn) {
            DomUtils.addEvent(collapseFilesBtn, 'click', collapseSidebar);
        }

        // Handle project files panel expand
        if (expandFilesBtn) {
            DomUtils.addEvent(expandFilesBtn, 'click', expandSidebar);
        }

        // Restore sidebar state
        restoreSidebarState();
    };

    /**
     * Collapse the sidebar
     */
    const collapseSidebar = function() {
        if (projectFilesContainer) {
            projectFilesContainer.classList.add('collapsed');
            DomUtils.showElement(expandFilesBtn);
            // Save state to localStorage
            localStorage.setItem('sidebar-collapsed', 'true');
        }
    };

    /**
     * Expand the sidebar
     */
    const expandSidebar = function() {
        if (projectFilesContainer) {
            projectFilesContainer.classList.remove('collapsed');
            DomUtils.hideElement(expandFilesBtn);
            // Save state to localStorage
            localStorage.setItem('sidebar-collapsed', 'false');
        }
    };

    /**
     * Restore sidebar state from localStorage
     */
    const restoreSidebarState = function() {
        const collapsed = localStorage.getItem('sidebar-collapsed');

        if (collapsed === 'true' && projectFilesContainer) {
            collapseSidebar();
        } else if (collapsed === 'false' && projectFilesContainer) {
            expandSidebar();
        }

        // If there are project files, show the sidebar
        if (FileUploadComponent.getProjectFiles().length > 0) {
            DomUtils.showElement(projectFilesContainer);
            // If it should be collapsed, collapse it
            if (collapsed === 'true') {
                collapseSidebar();
            }
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

    /**
     * Load project files from API
     */
    const loadProjectFiles = async function() {
        try {
            const data = await ApiService.getProjectFiles();

            if (data.files && data.files.length > 0) {
                // Update the UI
                DomUtils.showElement(projectFilesContainer);

                // Restore collapsed state if needed
                const collapsed = localStorage.getItem('sidebar-collapsed');
                if (collapsed === 'true') {
                    collapseSidebar();
                }

                // TODO: Process the files
                console.log('Project files loaded:', data.files);
            }
        } catch (error) {
            console.error('Failed to load project files:', error);
            // Don't throw, just log it - this is non-critical
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
        },

        /**
         * Collapse or expand the project files panel
         * @param {boolean} [collapse] - True to collapse, false to expand, toggle if not provided
         */
        toggleProjectFiles: function(collapse) {
            if (typeof collapse === 'boolean') {
                if (collapse) {
                    collapseSidebar();
                } else {
                    expandSidebar();
                }
            } else {
                if (projectFilesContainer && projectFilesContainer.classList.contains('collapsed')) {
                    expandSidebar();
                } else {
                    collapseSidebar();
                }
            }
        }
    };
})();

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});