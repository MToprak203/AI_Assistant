// electron/file-services/api-service.js
const axios = require('axios');
const { ipcMain } = require('electron');
const socketIo = require('socket.io-client');

class APIService {
  constructor() {
    this.baseUrl = 'http://127.0.0.1:5000';
    this.apiUrl = `${this.baseUrl}/api`;
    this.sessionId = null;
    this.socket = null;
    this.mainWindow = null;
  }

async initialize(mainWindow, config = {}) {
    this.mainWindow = mainWindow;

    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
      this.apiUrl = `${this.baseUrl}/api`;
    }

    // Test connection
    try {
      console.log(`Testing connection to backend at ${this.baseUrl}`);
      const response = await axios.get(`${this.apiUrl}/health-check`);
      console.log('Backend connection successful:', response.data);
    } catch (error) {
      console.error('Backend connection failed:', error.message);
    }

    // Setup socket connection
    this.setupSocketConnection();

    return this;
  }

  setupSocketConnection() {
    // Connect to socket.io server
    this.socket = socketIo(this.baseUrl, {
    transports: ['polling', 'websocket'],
    forceNew: true
  });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.notifyRenderer('socket-status', { connected: true });

      // If we have a session ID, join the session
      if (this.sessionId) {
        this.joinSession(this.sessionId);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.notifyRenderer('socket-status', { connected: false });
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.notifyRenderer('socket-status', {
        connected: false,
        error: error.message
      });
    });

    // Forward other events to renderer
    const eventsToForward = [
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

    eventsToForward.forEach(event => {
      this.socket.on(event, (data) => {
        this.notifyRenderer(`socket-${event}`, data);
      });
    });
  }

  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async createSession() {
    try {
      const response = await axios.post(`${this.apiUrl}/sessions`);
      this.sessionId = response.data.session_id;

      // Join the session via socket
      if (this.socket && this.socket.connected) {
        this.joinSession(this.sessionId);
      }

      return this.sessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  joinSession(sessionId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('join_session', { session_id: sessionId });
      return true;
    }
    return false;
  }

  async sendMessage(message, sessionId = null, filePath = null, fileFocus = null) {
    const targetSessionId = sessionId || this.sessionId;

    if (!targetSessionId) {
      throw new Error('No session ID available');
    }

    if (this.socket && this.socket.connected) {
      this.socket.emit('user_message', {
        session_id: targetSessionId,
        message: message,
        file_path: filePath,
        file_focus: fileFocus
      });
      return true;
    } else {
      throw new Error('Socket not connected');
    }
  }

  async sendProjectToBackend(files, sessionId = null) {
    const targetSessionId = sessionId || this.sessionId;

    if (!targetSessionId) {
      // Create a new session if needed
      await this.createSession();
    }

      try {
        // Ensure files are properly formatted with content
        const filesWithContent = Array.isArray(files) ? files.filter(file => file && file.path) : [];

        if (filesWithContent.length === 0) {
          console.error('No valid files provided to sendProjectToBackend');
          return { error: 'No valid files provided' };
        }

        // Create FormData for upload
        const formData = new FormData();
        formData.append('session_id', this.sessionId);

        // Add files to FormData
        filesWithContent.forEach((file, index) => {
          // If files already have content, use it
          if (!file.content && file.path) {
            // Try to read content if not provided
            try {
              const fs = require('fs');
              file.content = fs.readFileSync(file.path, 'utf8');
            } catch (err) {
              console.error(`Error reading file ${file.path}:`, err);
              file.content = `Error reading file: ${err.message}`;
            }
          }

          // Create a blob from the file content
          const blob = new Blob([file.content || ''], { type: 'text/plain' });

          // Create a File object
          const fileObj = new File([blob], file.filename, { type: 'text/plain' });

          // Append to FormData
          formData.append('files[]', fileObj);
        });

        // Send data to backend
        const response = await axios.post(`${this.apiUrl}/upload/multiple`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        return response.data;
      } catch (error) {
        console.error('Error sending project to backend:', error);
        if (error.response) {
          console.error('Response data:', error.response.data);
          console.error('Response status:', error.response.status);
        }
        throw error;
      }
}

  async updateFileOnBackend(fileData, sessionId = null) {
    const targetSessionId = sessionId || this.sessionId;

    if (!targetSessionId) {
      throw new Error('No session ID available');
    }

    try {
      // Only send update if the file was changed or added
      if (fileData.eventType === 'add' || fileData.eventType === 'change') {
        const formData = new FormData();
        formData.append('session_id', targetSessionId);
        formData.append('filename', fileData.filename);
        formData.append('content', fileData.content);

        const response = await axios.post(`${this.apiUrl}/update-file`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        return response.data;
      }

      return { success: true, action: 'no_action_needed' };
    } catch (error) {
      console.error('Error updating file on backend:', error);
      throw error;
    }
  }

  getSessionId() {
    return this.sessionId;
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

module.exports = new APIService();