// electron/main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const url = require('url');
const Store = require('electron-store');
const fileManager = require('./file-services/file-manager');
const apiService = require('./file-services/api-service');
const backendLauncher = require('./backend-launcher');
const { createMenu } = require('./menu');

// Create a store for app settings
const store = new Store();

// App settings
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const port = process.env.PORT || 5000;
const apiUrl = process.env.API_URL || `http://127.0.0.1:${port}`;

let mainWindow;
let currentProjectPath = null;
let backendStarted = false;

async function startBackend() {
  // Don't start the backend in dev mode (assume it's already running)
  if (isDev) {
    console.log('Development mode - not starting backend');
    return true;
  }

  console.log('Starting backend server...');
  const success = await backendLauncher.start();

  if (success) {
    console.log('Backend started successfully');
    backendStarted = true;
    return true;
  } else {
    console.error('Failed to start backend');
    return false;
  }
}

async function createWindow() {
  // Try to start backend first
  await startBackend();

  // Get window state from store
  const windowState = store.get('windowState', {
    width: 1200,
    height: 800,
    x: undefined,
    y: undefined
  });

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'AI Code Assistant',
    icon: path.join(__dirname, '../frontend/static/images/icon.png')
  });

  // Create application menu
  createMenu(mainWindow);

  // Save window state on close
  mainWindow.on('close', () => {
    const { width, height } = mainWindow.getBounds();
    store.set('windowState', {
      width,
      height,
      x: mainWindow.getPosition()[0],
      y: mainWindow.getPosition()[1]
    });

    // Stop file watching
    fileManager.stopWatching();

    // Disconnect API
    apiService.disconnect();
  });

  // Open links in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  if (isDev) {
    // In development mode, load from the dev server
    mainWindow.loadURL(apiUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // Give the backend a moment to start
    setTimeout(() => {
      // In production, load the bundled app
      mainWindow.loadFile(path.join(__dirname, '../frontend/template/index.html'));
    }, 1000);
  }

  // Initialize API service
  apiService.initialize(mainWindow, { baseUrl: apiUrl });
}

app.whenReady().then(async () => {
  await createWindow();

  // Restore previous project if available
  const previousProject = store.get('lastProject');
  if (previousProject) {
    currentProjectPath = previousProject;
    console.log('Last project path:', currentProjectPath);
  }

  app.on('activate', async function () {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', function () {
  // Stop the backend if we started it
  if (backendStarted) {
    backendLauncher.stop();
  }

  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Stop the backend if we started it
  if (backendStarted) {
    backendLauncher.stop();
  }
});

// IPC handlers for file operations
ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Folder'
  });

  if (!result.canceled) {
    const projectPath = result.filePaths[0];

    // Save to store
    store.set('lastProject', projectPath);
    currentProjectPath = projectPath;

    return projectPath;
  }
  return null;
});

ipcMain.handle('get-project-structure', async (event, projectPath) => {
  try {
    const files = await fileManager.getProjectStructure(projectPath);

    // Start watching the project for changes
    fileManager.watchProjectFiles((changedFile) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Notify renderer process
        mainWindow.webContents.send('project-files-changed', changedFile);

        // If we have an active session, update the backend
        const sessionId = apiService.getSessionId();
        if (sessionId && changedFile.eventType !== 'delete') {
          apiService.updateFileOnBackend(changedFile, sessionId)
            .catch(err => console.error('Error updating backend:', err));
        }
      }
    });

    return files;
  } catch (error) {
    console.error('Error getting project structure:', error);
    throw error;
  }
});

ipcMain.handle('get-file-content', async (event, filePath) => {
  try {
    return fileManager.getFileContent(filePath);
  } catch (error) {
    console.error('Error getting file content:', error);
    throw error;
  }
});

ipcMain.handle('send-project-to-backend', async (event, sessionId, files) => {
  try {
    // Add content to files
    const filesWithContent = await Promise.all(files.map(async file => {
      try {
        const content = fileManager.getFileContent(file.path);
        return {
          ...file,
          content
        };
      } catch (error) {
        console.error(`Error reading file ${file.path}:`, error);
        return {
          ...file,
          content: `Error reading file: ${error.message}`
        };
      }
    }));

    return await apiService.sendProjectToBackend(filesWithContent, sessionId);
  } catch (error) {
    console.error('Error sending project to backend:', error);
    throw error;
  }
});

ipcMain.handle('send-chat-message', async (event, data) => {
  try {
    return await apiService.sendMessage(
      data.message,
      data.sessionId,
      data.filePath,
      data.fileFocus
    );
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
});

ipcMain.handle('create-session', async () => {
  try {
    return await apiService.createSession();
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
});

// Get last project path
ipcMain.handle('get-last-project', () => {
  return currentProjectPath;
});