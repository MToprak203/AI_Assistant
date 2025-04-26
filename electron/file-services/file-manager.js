// electron/file-services/file-manager.js
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

class FileManager {
  constructor() {
    this.watcher = null;
    this.projectPath = null;
    this.onChange = null;
    // File extensions to consider as code files
    this.codeExtensions = new Set([
      // Programming languages
      '.py', '.java', '.js', '.jsx', '.ts', '.tsx', '.html', '.css',
      '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php',
      '.swift', '.kt', '.scala', '.groovy', '.dart', '.lua',
      // Config/markup files
      '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.md', '.sql',
      // Shell scripts
      '.sh', '.bash', '.zsh', '.bat', '.ps1'
    ]);
  }

  isCodeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.codeExtensions.has(ext);
  }

  async getProjectStructure(projectPath) {
    this.projectPath = projectPath;
    const fileList = [];

    try {
      await this.scanDirectory(projectPath, fileList, '');
      return fileList;
    } catch (error) {
      console.error('Error scanning directory:', error);
      throw error;
    }
  }

  async scanDirectory(dirPath, fileList, relativePath) {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativePath, entry.name);

      // Skip node_modules, .git, and other common directories to ignore
      if (entry.isDirectory()) {
        if (['node_modules', '.git', '__pycache__', 'venv', 'dist', 'build'].includes(entry.name)) {
          continue;
        }
        await this.scanDirectory(fullPath, fileList, relPath);
      } else if (this.isCodeFile(entry.name)) {
        const stats = await fs.promises.stat(fullPath);
        fileList.push({
          filename: relPath,
          path: fullPath,
          size: stats.size,
          lastModified: stats.mtime
        });
      }
    }
  }

  getFileContent(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  watchProjectFiles(callback) {
    if (!this.projectPath) {
      throw new Error('No project path set');
    }

    // Stop any existing watcher
    this.stopWatching();

    // Store callback
    this.onChange = callback;

    // Initialize watcher
    this.watcher = chokidar.watch(this.projectPath, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        '**/node_modules/**',
        '**/.git/**',
        '**/__pycache__/**',
        '**/venv/**',
        '**/dist/**',
        '**/build/**'
      ],
      persistent: true
    });

    // Add event listeners
    this.watcher
      .on('add', path => this.handleFileChange('add', path))
      .on('change', path => this.handleFileChange('change', path))
      .on('unlink', path => this.handleFileChange('delete', path));

    return true;
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  handleFileChange(eventType, filePath) {
    if (!this.isCodeFile(filePath)) return;

    const relativePath = path.relative(this.projectPath, filePath);

    if (this.onChange) {
      try {
        // For add and change events, include file content
        let content = null;
        if (eventType !== 'delete' && fs.existsSync(filePath)) {
          content = this.getFileContent(filePath);
        }

        this.onChange({
          eventType,
          filename: relativePath,
          path: filePath,
          content
        });
      } catch (error) {
        console.error('Error handling file change:', error);
      }
    }
  }
}

module.exports = new FileManager();