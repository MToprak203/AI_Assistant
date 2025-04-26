// scripts/dev.js
const { spawn } = require('child_process');
const path = require('path');
const process = require('process');

// Find the root directory
const rootDir = path.resolve(__dirname, '..');

// Start Python Flask server
console.log('Starting Flask server...');
const flaskProcess = spawn('python', ['-m', 'entrypoints.web'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    FLASK_ENV: 'development',
    FLASK_DEBUG: '1'
  }
});

// Give the Flask server a moment to start
setTimeout(() => {
  // Start Electron in dev mode
  console.log('Starting Electron...');
  const electronPath = path.join(rootDir, 'node_modules', '.bin', 'electron.cmd');

  const electronProcess = spawn(electronPath, [rootDir, '--dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true
  });

  // Handle Electron exit
  electronProcess.on('close', (code) => {
    console.log(`Electron process exited with code ${code}`);
    flaskProcess.kill();
    process.exit(code);
  });
}, 5000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('Terminating processes...');
  flaskProcess.kill();
  process.exit(0);
});