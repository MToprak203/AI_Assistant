// scripts/prepare-build.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to execute shell commands
function exec(command) {
  console.log(`Executing: ${command}`);
  execSync(command, { stdio: 'inherit' });
}

// Directory for bundled Python app
const pythonDistDir = path.join(__dirname, '../python-dist');
if (!fs.existsSync(pythonDistDir)) {
  fs.mkdirSync(pythonDistDir, { recursive: true });
}

// Install PyInstaller if needed
console.log('Installing PyInstaller...');
exec('pip install pyinstaller');

// Bundle Python application
console.log('Bundling Python application...');
exec('pyinstaller --onefile --distpath ./python-dist --name backend entrypoints/web.py');

console.log('Python application bundled successfully!');