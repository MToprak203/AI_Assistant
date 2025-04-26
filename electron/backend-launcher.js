// electron/backend-launcher.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class BackendLauncher {
  constructor() {
    this.process = null;
    this.isRunning = false;
    this.port = process.env.PORT || 5000;
    this.isPythonAvailable = this.checkPythonAvailable();
  }

  checkPythonAvailable() {
    try {
      // Try to find Python executable
      const pythonProcess = spawn('python', ['--version']);
      return true;
    } catch (error) {
      console.error('Python not found on PATH');
      return false;
    }
  }

  async start() {
  if (this.isRunning) {
    console.log('Backend already running');
    return true;
  }

  try {
    const appRoot = path.join(__dirname, '..');
    const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

    if (isDev) {
      // Development mode - use module import
      this.process = spawn('python', ['-m', 'entrypoints.web'], {
        cwd: appRoot,
        env: {
          ...process.env,
          PORT: this.port.toString()
        }
      });
    } else {
      // Production mode - use bundled executable
      const executableName = process.platform === 'win32' ? 'backend.exe' : 'backend';
      const executablePath = path.join(appRoot, 'python-dist', executableName);

      if (!fs.existsSync(executablePath)) {
        console.error(`Bundled backend not found at ${executablePath}`);
        return false;
      }

      this.process = spawn(executablePath, [], {
        cwd: appRoot,
        env: {
          ...process.env,
          PORT: this.port.toString()
        }
      });
    }

      this.isRunning = true;

      // Log output
      this.process.stdout.on('data', (data) => {
        console.log(`Backend stdout: ${data}`);
      });

      this.process.stderr.on('data', (data) => {
        console.error(`Backend stderr: ${data}`);
      });

      this.process.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`);
        this.isRunning = false;
        this.process = null;
      });

      return true;
    } catch (error) {
      console.error('Failed to start backend:', error);
      return false;
    }
  }

  stop() {
    if (!this.isRunning || !this.process) {
      return;
    }

    try {
      // Try to gracefully kill the process
      this.process.kill();
    } catch (error) {
      console.error('Error stopping backend:', error);
    }
  }
}

module.exports = new BackendLauncher();