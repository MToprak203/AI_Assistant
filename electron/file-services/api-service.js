// electron/file-services/api-service.js
const axios = require('axios');
const { ipcMain } = require('electron');
const socketIo = require('socket.io-client');
const fs = require('fs');
const path = require('path');

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

    // Create session after connection
    this.createSession().catch(err => console.error('Error creating initial session:', err));

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
      console.log('Creating a new session');
      const response = await axios.post(`${this.apiUrl}/sessions`);
      this.sessionId = response.data.session_id;
      console.log('Session created successfully: ' + this.sessionId);

      // Save session ID in a cookie for subsequent requests
      axios.defaults.headers.common['X-Session-Id'] = this.sessionId;

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
      console.log('Joining session:', sessionId);
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
    // Make sure we have a session
    if (!this.sessionId && !sessionId) {
      console.log('No session available, creating one');
      await this.createSession();
    }

    const targetSessionId = sessionId || this.sessionId;
    console.log('Using session ID for upload:', targetSessionId);

    try {
      // Prepare project files data as a JSON object
      const projectData = {
        session_id: targetSessionId,
        files: []
      };

      // Process files to include content
      if (Array.isArray(files)) {
        for (const file of files) {
          if (!file || !file.path) continue;

          try {
            let content = file.content;

            // If content not provided, read it from disk
            if (!content) {
              try {
                content = fs.readFileSync(file.path, 'utf8');
              } catch (err) {
                console.error(`Error reading file ${file.path}:`, err);
                content = `Error reading file: ${err.message}`;
              }
            }

            // Add to project data
            projectData.files.push({
              filename: file.filename || path.basename(file.path),
              content: content
            });
          } catch (err) {
            console.error(`Error processing file ${file.path}:`, err);
          }
        }
      }

      console.log(`Sending project with ${projectData.files.length} files to backend using session ${targetSessionId}`);

      // Include the session ID in both the request body and as a header
      const response = await axios.post(`${this.apiUrl}/upload/multiple`, projectData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': targetSessionId
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error sending project to backend:', error);

      // Log more details about the error
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      } else if (error.request) {
        console.error('No response received');
      } else {
        console.error('Error during request setup:', error.message);
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
        // Simplify by using JSON instead of FormData
        const data = {
          session_id: targetSessionId,
          filename: fileData.filename,
          content: fileData.content
        };

        const response = await axios.post(`${this.apiUrl}/update-file`, data, {
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': targetSessionId
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