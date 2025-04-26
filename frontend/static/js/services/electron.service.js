// frontend/static/js/services/electron.service.js
const ElectronService = (function() {
  // Check if running in Electron
  const isElectron = () => {
    return window.electronAPI !== undefined && window.electronLoaded === true;
  };

  // Socket event listeners
  const socketEventListeners = {};

  // Initialize the service
  const init = function() {
    if (!isElectron()) return;

    // Setup socket event proxy to forward events from main to renderer
    setupSocketEventProxy();

    // Listen for menu events
    window.electronAPI.onSocketEvent('menu-open-project', (data) => {
      if (data && data.projectPath) {
        loadProjectByPath(data.projectPath);
      }
    });

    window.electronAPI.onSocketEvent('menu-reload-project', () => {
      reloadCurrentProject();
    });

    window.electronAPI.onSocketEvent('menu-reconnect', () => {
      // Trigger reconnection in socket service
      if (SocketService && typeof SocketService.connect === 'function') {
        SocketService.connect();
      }
    });

    // Check for last project
    checkLastProject();
  };

  // Setup socket event proxy
  const setupSocketEventProxy = function() {
    if (!isElectron()) return;

    // Socket status
    window.electronAPI.onSocketStatus((status) => {
      EventUtils.publish('socketStatus', status);
    });

    // Standard socket events
    const socketEvents = [
      'session_joined',
      'model_initialized',
      'model_status',
      'assistant_chunk',
      'assistant_response',
      'assistant_response_complete',
      'project_update_result',
      'project_files',
      'error'
    ];

    socketEvents.forEach(eventName => {
      const unsubscribe = window.electronAPI.onSocketEvent(eventName, (data) => {
        // Forward to Socket service or directly to event subscribers
        EventUtils.publish(`socket:${eventName}`, data);
      });

      socketEventListeners[eventName] = unsubscribe;
    });
  };

  // Check for last project
  const checkLastProject = async function() {
    if (!isElectron()) return;

    try {
      const lastProjectPath = await window.electronAPI.getLastProject();
      if (lastProjectPath) {
        console.log('Found last project:', lastProjectPath);

        // Ask user if they want to reload the project
        const reload = confirm(`Would you like to reload your last project from:\n${lastProjectPath}`);

        if (reload) {
          loadProjectByPath(lastProjectPath);
        }
      }
    } catch (error) {
      console.error('Error checking last project:', error);
    }
  };

  // Load project by path
  const loadProjectByPath = async function(projectPath) {
    if (!isElectron()) return;

    try {
      // Get project files
      const files = await window.electronAPI.getProjectStructure(projectPath);

      // Publish event for file upload component to handle
      EventUtils.publish('loadProject', {
        projectPath,
        files
      });

      return {
        projectPath,
        files
      };
    } catch (error) {
      console.error('Error loading project by path:', error);
      DomUtils.showError(`Failed to load project: ${error.message}`);
      return null;
    }
  };

  // Reload current project
  const reloadCurrentProject = function() {
    // This is handled by subscribed components
    EventUtils.publish('reloadProject', {});
  };

  // Function to select and load a project
  const loadProject = async () => {
    if (!isElectron()) {
      DomUtils.showError('This feature requires the desktop application');
      return null;
    }

    try {
      // Select project folder
      const projectPath = await window.electronAPI.selectProjectFolder();
      if (!projectPath) return null; // User canceled

      return loadProjectByPath(projectPath);
    } catch (error) {
      console.error('Error loading project:', error);
      DomUtils.showError(`Failed to load project: ${error.message}`);
      return null;
    }
  };

  // Send project files to backend
  const sendProjectToBackend = async (sessionId, files) => {
    if (!isElectron()) return null;

    try {
      return await window.electronAPI.sendProjectToBackend(sessionId, files);
    } catch (error) {
      console.error('Error sending project to backend:', error);
      throw error;
    }
  };

  // Create a new session
  const createSession = async () => {
    if (!isElectron()) return null;

    try {
      return await window.electronAPI.createSession();
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  };

  // Send a message
  const sendChatMessage = async (data) => {
    if (!isElectron()) return false;

    try {
      return await window.electronAPI.sendChatMessage(data);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  // Subscribe to file change events
  const subscribeToFileChanges = (callback) => {
    if (!isElectron()) return () => {};

    return window.electronAPI.onProjectFilesChanged(callback);
  };

  // Cleanup function
  const cleanup = function() {
    // Unsubscribe from socket events
    Object.values(socketEventListeners).forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  };

  return {
    init,
    isElectron,
    loadProject,
    sendProjectToBackend,
    createSession,
    sendChatMessage,
    subscribeToFileChanges,
    cleanup
  };
})();

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
  if (ElectronService.isElectron()) {
    ElectronService.init();
  }
});