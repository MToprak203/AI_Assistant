// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Safe IPC messaging
contextBridge.exposeInMainWorld(
  'electronAPI', {
    // Project handling
    selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),
    getProjectStructure: (path) => ipcRenderer.invoke('get-project-structure', path),
    getFileContent: (path) => ipcRenderer.invoke('get-file-content', path),
    sendProjectToBackend: (sessionId, files) => ipcRenderer.invoke('send-project-to-backend', sessionId, files),
    getLastProject: () => ipcRenderer.invoke('get-last-project'),

    // Chat and session management
    createSession: () => ipcRenderer.invoke('create-session'),
    sendChatMessage: (data) => ipcRenderer.invoke('send-chat-message', data),

    // Events
    onSocketStatus: (callback) => {
      const subscription = (event, status) => callback(status);
      ipcRenderer.on('socket-status', subscription);
      return () => ipcRenderer.removeListener('socket-status', subscription);
    },

    onSocketEvent: (eventName, callback) => {
      const channel = `socket-${eventName}`;
      const subscription = (event, data) => callback(data);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },

    onProjectFilesChanged: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('project-files-changed', subscription);
      return () => ipcRenderer.removeListener('project-files-changed', subscription);
    }
  }
);

// Notify that preload script has executed
contextBridge.exposeInMainWorld('electronLoaded', true);