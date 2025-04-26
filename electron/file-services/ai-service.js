// electron/file-services/ai-service.js
const axios = require('axios');
const fileManager = require('./file-manager');

class AIService {
  constructor() {
    this.baseUrl = 'http://127.0.0.1:5000/api';
    this.sessionId = null;
    this.socket = null;
  }

  async createSession() {
    try {
      const response = await axios.post(`${this.baseUrl}/sessions`);
      this.sessionId = response.data.session_id;
      return this.sessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  async sendProjectToBackend(sessionId, files) {
    try {
      const projectData = [];

      for (const file of files) {
        try {
          const content = fileManager.getFileContent(file.path);
          projectData.push({
            filename: file.filename,
            content: content
          });
        } catch (error) {
          console.error(`Error reading file ${file.path}:`, error);
        }
      }

      // Send project files to backend
      const response = await axios.post(`${this.baseUrl}/upload/multiple`, {
        session_id: sessionId,
        files: projectData
      });

      return response.data;
    } catch (error) {
      console.error('Error sending project to backend:', error);
      throw new Error(`Failed to send project to backend: ${error.message}`);
    }
  }

  async updateFileOnBackend(sessionId, fileData) {
    try {
      const response = await axios.post(`${this.baseUrl}/update-file`, {
        session_id: sessionId,
        filename: fileData.filename,
        content: fileData.content
      });

      return response.data;
    } catch (error) {
      console.error('Error updating file on backend:', error);
      throw new Error(`Failed to update file on backend: ${error.message}`);
    }
  }
}

module.exports = new AIService();