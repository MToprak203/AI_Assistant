// scripts/build.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to execute shell commands
function exec(command) {
  console.log(`Executing: ${command}`);
  execSync(command, { stdio: 'inherit' });
}

// Determine platform
const platform = process.platform;
console.log(`Building for platform: ${platform}`);

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Check if PyInstaller bundle exists
const pythonDistDir = path.join(__dirname, '../python-dist');
const executableName = platform === 'win32' ? 'backend.exe' : 'backend';
const executablePath = path.join(pythonDistDir, executableName);

if (!fs.existsSync(executablePath)) {
  console.log('Python bundle not found. Creating it now...');
  exec('npm run prepare:build');
}

// Build Electron app
console.log('Building Electron application...');
const buildCommand = platform === 'win32' ? 'npm run build:win' :
                     platform === 'darwin' ? 'npm run build:mac' :
                     'npm run build:linux';

try {
  exec(buildCommand);
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}