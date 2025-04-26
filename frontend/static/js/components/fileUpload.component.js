// frontend/static/js/components/fileUpload.component.js

/**
 * Component for handling project files in Electron environment
 */
const FileUploadComponent = (function() {
    // Private properties
    const projectFilesContainer = DomUtils.getById('project-files-container');
    const projectFilesList = DomUtils.getById('project-files-list');

    // Track project files
    let projectFiles = [];
    let primaryFile = null;
    let currentProjectPath = null;

    /**
     * Initialize the component
     */
    const init = function() {
        // Add electron-specific project loader button if running in Electron
        if (ElectronService.isElectron()) {
            addProjectLoaderButton();
        } else {
            // If not in Electron, show a message that desktop functionality is limited
            DomUtils.showToast('For full project access, use the desktop application', 'info', 5000);
        }

        // Setup expand/collapse functionality for project files sidebar
        setupSidebarToggle();

        // Register as observer for events
        EventUtils.subscribe('sessionInitialized', data => {
            console.log('Session initialized:', data);

            // If we have an existing project, reload it
            if (currentProjectPath && ElectronService.isElectron()) {
                reloadProject(currentProjectPath);
            }
        });
    };

    /**
     * Add a project folder button for Electron
     */
    const addProjectLoaderButton = function() {
        // Create a button container
        const buttonContainer = DomUtils.createElement('div', {}, 'flex space-x-2');

        // Create a new button for loading entire projects
        const projectBtn = DomUtils.createElement('button', {
            id: 'load-project-btn',
            title: 'Load Project Folder'
        }, 'upload-button');

        projectBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="upload-button-icon h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>Load Project</span>
        `;

        // Add click handler
        DomUtils.addEvent(projectBtn, 'click', handleProjectLoad);

        // Add the button to the container
        DomUtils.appendChild(buttonContainer, projectBtn);

        // Add the button container to the upload container
        const uploadContainer = DomUtils.getById('file-upload-container');
        if (uploadContainer) {
            // Clear existing content
            DomUtils.setHtml(uploadContainer, '');
            DomUtils.appendChild(uploadContainer, buttonContainer);
        }
    };

    /**
     * Set up sidebar toggle functionality
     */
    const setupSidebarToggle = function() {
        const collapseFilesBtn = DomUtils.getById('collapse-files-btn');
        const expandFilesBtn = DomUtils.getById('expand-files-btn');

        if (collapseFilesBtn) {
            DomUtils.addEvent(collapseFilesBtn, 'click', collapseSidebar);
        }

        if (expandFilesBtn) {
            DomUtils.addEvent(expandFilesBtn, 'click', expandSidebar);
        }

        // Restore previous state from localStorage
        restoreSidebarState();
    };

    /**
     * Collapse the sidebar
     */
    const collapseSidebar = function() {
        if (projectFilesContainer) {
            projectFilesContainer.classList.add('collapsed');
            const expandBtn = DomUtils.getById('expand-files-btn');
            if (expandBtn) {
                DomUtils.showElement(expandBtn);
            }
            // Save state to localStorage
            localStorage.setItem('sidebar-collapsed', 'true');
        }
    };

    /**
     * Expand the sidebar
     */
    const expandSidebar = function() {
        if (projectFilesContainer) {
            projectFilesContainer.classList.remove('collapsed');
            const expandBtn = DomUtils.getById('expand-files-btn');
            if (expandBtn) {
                DomUtils.hideElement(expandBtn);
            }
            // Save state to localStorage
            localStorage.setItem('sidebar-collapsed', 'false');
        }
    };

    /**
     * Restore sidebar state from localStorage
     */
    const restoreSidebarState = function() {
        const collapsed = localStorage.getItem('sidebar-collapsed');

        if (collapsed === 'true' && projectFilesContainer) {
            collapseSidebar();
        } else if (collapsed === 'false' && projectFilesContainer) {
            expandSidebar();
        }
    };

    /**
     * Handle project loading
     */
    const handleProjectLoad = async function() {
        try {
            const projectData = await ElectronService.loadProject();
            if (!projectData) return;

            const { projectPath, files } = projectData;
            currentProjectPath = projectPath;

            // Show loading toast
            DomUtils.showToast(`Loading project with ${files.length} files...`, 'info');

            // Get session ID from socket service
            const sessionId = SocketService.getSessionId();
            if (!sessionId) {
                DomUtils.showError('No active session');
                return;
            }

            // Send to backend
            const result = await ElectronService.sendProjectToBackend(sessionId, files);

            // Process the files for UI
            projectFiles = files.map(file => ({
                filename: file.filename,
                path: file.path,
                lastModified: file.lastModified,
                size: file.size
            }));

            // Set primary file to the first one if none is set
            if (!primaryFile && projectFiles.length > 0) {
                primaryFile = projectFiles[0].filename;
            }

            // Update project files list in the UI
            updateProjectFilesList();

            // Subscribe to file changes
            const unsubscribe = ElectronService.subscribeToFileChanges((changedFile) => {
                console.log('File changed:', changedFile);

                // Update the UI and notify the user as needed
                if (changedFile.eventType === 'add' || changedFile.eventType === 'change') {
                    // Update file in the list or add it
                    const existingIndex = projectFiles.findIndex(f => f.filename === changedFile.filename);
                    if (existingIndex !== -1) {
                        projectFiles[existingIndex] = {
                            filename: changedFile.filename,
                            path: changedFile.path
                        };
                        DomUtils.showToast(`File updated: ${changedFile.filename}`, 'info', 2000);
                    } else {
                        projectFiles.push({
                            filename: changedFile.filename,
                            path: changedFile.path
                        });
                        DomUtils.showToast(`New file added: ${changedFile.filename}`, 'info', 2000);
                    }
                } else if (changedFile.eventType === 'delete') {
                    // Remove file from list
                    projectFiles = projectFiles.filter(f => f.filename !== changedFile.filename);
                    DomUtils.showToast(`File removed: ${changedFile.filename}`, 'info', 2000);

                    // If this was the primary file, reset
                    if (primaryFile === changedFile.filename) {
                        primaryFile = projectFiles.length > 0 ? projectFiles[0].filename : null;
                    }
                }

                // Update UI
                updateProjectFilesList();
            });

            // Store unsubscribe function for cleanup
            window._fileChangeUnsubscribe = unsubscribe;

            // Show success message
            DomUtils.showToast(`Project loaded with ${files.length} files`, 'success');

            // Show the project files panel
            DomUtils.showElement(projectFilesContainer);
            expandSidebar();

            // Inform through chat that project was loaded
            ChatComponent.addMessage('user', `I've loaded a project with ${files.length} files. The project is located at ${projectPath}.`);
        } catch (error) {
            console.error('Project loading error:', error);
            DomUtils.showError(`Failed to load project: ${error.message}`);
        }
    };

    /**
     * Reload a project from a path
     */
    const reloadProject = async function(projectPath) {
        try {
            const files = await window.electronAPI.getProjectStructure(projectPath);

            // Process the rest as in handleProjectLoad
            // (Similar logic as above, avoiding duplication)
            const sessionId = SocketService.getSessionId();
            if (sessionId) {
                await ElectronService.sendProjectToBackend(sessionId, files);
                DomUtils.showToast(`Project reloaded with ${files.length} files`, 'success');
            }
        } catch (error) {
            console.error('Project reload error:', error);
        }
    };

    /**
     * Set primary file (focus on this file in the conversation)
     * @param {string} filename - Filename to focus on
     */
    const setPrimaryFile = function(filename) {
        // Update UI
        const fileItems = projectFilesList.querySelectorAll('.project-file-item');
        fileItems.forEach(item => {
            const itemFilename = item.getAttribute('data-filename');
            if (itemFilename === filename) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        primaryFile = filename;

        // Notify via socket
        SocketService.emit('project_update', {
            session_id: SocketService.getSessionId(),
            action: 'focus',
            filename: filename
        });

        // Show toast
        DomUtils.showToast(`Now focusing on ${filename}`);
    };

    /**
     * Remove a file from the project (UI only, doesn't delete file)
     * @param {string} filename - Filename to remove
     */
    const removeProjectFile = function(filename) {
        // Find file in projectFiles
        const fileIndex = projectFiles.findIndex(f => f.filename === filename);
        if (fileIndex !== -1) {
            projectFiles.splice(fileIndex, 1);
        }

        // Update UI
        updateProjectFilesList();

        // Notify via socket
        SocketService.emit('project_update', {
            session_id: SocketService.getSessionId(),
            action: 'remove',
            filename: filename
        });

        // Show toast
        DomUtils.showToast(`Removed ${filename}`);

        // If this was the primary file, reset
        if (primaryFile === filename) {
            primaryFile = projectFiles.length > 0 ? projectFiles[0].filename : null;
            if (primaryFile) {
                setPrimaryFile(primaryFile);
            }
        }
    };

    /**
     * Update the project files list in the UI
     */
    const updateProjectFilesList = function() {
        if (!projectFilesList) return;

        // Clear the list
        DomUtils.setHtml(projectFilesList, '');

        // If we have files, show the container
        if (projectFiles.length > 0) {
            DomUtils.showElement(projectFilesContainer);

            // Group files by directory
            const filesByDirectory = {};
            projectFiles.forEach(file => {
                const filename = file.filename;
                const lastSlashIndex = filename.lastIndexOf('/');

                // If file has a directory path
                if (lastSlashIndex !== -1) {
                    const directory = filename.substring(0, lastSlashIndex);
                    const basename = filename.substring(lastSlashIndex + 1);

                    filesByDirectory[directory] = filesByDirectory[directory] || [];
                    filesByDirectory[directory].push({
                        ...file,
                        basename
                    });
                } else {
                    // Root directory files
                    filesByDirectory[''] = filesByDirectory[''] || [];
                    filesByDirectory[''].push({
                        ...file,
                        basename: filename
                    });
                }
            });

            // Create directory headers and file items
            Object.keys(filesByDirectory).sort().forEach(directory => {
                const files = filesByDirectory[directory];

                // If not root directory, add directory header
                if (directory !== '') {
                    const dirHeader = DomUtils.createElement('div', {}, 'bg-gray-100 p-2 text-sm font-semibold text-gray-700 border-b');
                    dirHeader.textContent = directory;
                    DomUtils.appendChild(projectFilesList, dirHeader);
                }

                // Add files
                files.sort((a, b) => a.basename.localeCompare(b.basename)).forEach(file => {
                    const fileItem = createFileItem(file);
                    DomUtils.appendChild(projectFilesList, fileItem);
                });
            });
        } else {
            // No files - show a message
            const emptyMessage = DomUtils.createElement('div', {}, 'p-4 text-sm text-gray-500 text-center');
            emptyMessage.textContent = 'No project files loaded';
            DomUtils.appendChild(projectFilesList, emptyMessage);
        }
    };

    /**
     * Create a file item element
     * @param {Object} file - File data
     * @returns {HTMLElement} File item element
     */
    const createFileItem = function(file) {
        const fileItem = DomUtils.createElement('div', {
            'data-filename': file.filename,
            'title': file.filename
        }, 'project-file-item flex items-center justify-between p-2 border-b hover:bg-gray-50');

        // Set as active if this is the primary file
        if (file.filename === primaryFile) {
            fileItem.classList.add('active');
        }

        // File name and icon
        const fileNameContainer = DomUtils.createElement('div', {}, 'flex items-center flex-1 min-w-0');

        const fileIcon = DomUtils.createElement('div', {}, 'file-icon mr-2 flex-shrink-0');
        fileIcon.innerHTML = getFileIcon(file.basename || file.filename);

        const fileNameSpan = DomUtils.createElement('span', {}, 'file-name text-sm truncate');
        fileNameSpan.textContent = file.basename || file.filename;

        DomUtils.appendChild(fileNameContainer, fileIcon);
        DomUtils.appendChild(fileNameContainer, fileNameSpan);

        // Actions (focus, remove)
        const actionsContainer = DomUtils.createElement('div', {}, 'flex items-center ml-2');

        const focusBtn = DomUtils.createElement('button', {
            title: 'Focus on this file',
            type: 'button'
        }, 'focus-file-btn p-1 text-blue-600 hover:text-blue-800 mr-2');
        focusBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>`;
        DomUtils.addEvent(focusBtn, 'click', () => setPrimaryFile(file.filename));

        const removeBtn = DomUtils.createElement('button', {
            title: 'Remove this file from view',
            type: 'button'
        }, 'remove-file-btn p-1 text-red-600 hover:text-red-800');
        removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>`;
        DomUtils.addEvent(removeBtn, 'click', () => removeProjectFile(file.filename));

        DomUtils.appendChild(actionsContainer, focusBtn);
        DomUtils.appendChild(actionsContainer, removeBtn);

        // Add name and actions to the item
        DomUtils.appendChild(fileItem, fileNameContainer);
        DomUtils.appendChild(fileItem, actionsContainer);

        return fileItem;
    };

    /**
     * Get an appropriate icon for a file based on its extension
     * @param {string} filename - Filename
     * @returns {string} HTML for the icon
     */
    const getFileIcon = function(filename) {
        // Check if filename is not null or undefined
        if (!filename) {
            // Default icon for unknown file type
            return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="#6B7280" stroke="currentColor" stroke-width="0.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 4h7v5h5v11H6V4z" />
            </svg>`;
        }

        // Safe way to get extension - ensure filename is a string and has a "." character
        const ext = (typeof filename === 'string' && filename.includes('.'))
            ? filename.split('.').pop().toLowerCase()
            : '';

        let color = '#6B7280'; // Default gray
        let iconPath = '';

        // Set color and icon based on extension
        if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
            color = '#F7DF1E'; // JavaScript yellow
            iconPath = 'M3 3h18v18H3V3zm16.525 13.707c-.131-.821-.666-1.511-2.252-2.155-.552-.259-1.165-.438-1.349-.854-.068-.248-.078-.382-.034-.529.113-.484.687-.629 1.137-.495.293.09.563.315.732.676.775-.507.775-.507 1.316-.844-.203-.314-.304-.451-.439-.586-.473-.528-1.103-.798-2.126-.775l-.528.067c-.507.124-.991.395-1.283.754-.855.968-.608 2.655.427 3.354 1.023.765 2.521.933 2.712 1.653.18.878-.652 1.159-1.475 1.058-.607-.136-.945-.439-1.316-1.002l-1.372.788c.157.359.337.517.607.832 1.305 1.316 4.568 1.249 5.153-.754.021-.067.18-.528.056-1.237l.034.049zm-6.737-5.434h-1.686c0 1.453-.007 2.898-.007 4.354 0 .924.047 1.772-.104 2.033-.247.517-.886.451-1.175.359-.297-.146-.448-.349-.623-.641-.047-.078-.082-.146-.095-.146l-1.368.844c.229.473.563.879.994 1.137.641.383 1.502.507 2.404.305.588-.17 1.095-.519 1.358-1.059.384-.697.302-1.553.299-2.509.008-1.541 0-3.083 0-4.635l.003-.042z';
        } else if (['py'].includes(ext)) {
            color = '#3776AB'; // Python blue
            iconPath = 'M11.434 8.752a1.176 1.176 0 0 1 1.176-1.176h1.042V5.347A2.347 2.347 0 0 0 11.305 3H8.099a2.347 2.347 0 0 0-2.347 2.347v2.117h7.183v1.31h-4.923a1.177 1.177 0 0 0-1.176 1.176v4.835A2.347 2.347 0 0 0 9.183 17h3.207a2.347 2.347 0 0 0 2.347-2.347v-2.117H7.554V11.27h7.434c.65 0 1.175-.525 1.175-1.176V8.752a1.176 1.176 0 0 0-1.175-1.176h-3.554zm.73-3.836a.79.79 0 1 1 0 1.579.79.79 0 0 1 0-1.579zm-3.532 9.835a.79.79 0 1 1 0 1.58.79.79 0 0 1 0-1.58z';
        } else if (['java'].includes(ext)) {
            color = '#ED8B00'; // Java orange
            iconPath = 'M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149M8.276 15.933s-1.028.761.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0-.001-8.216 2.051-4.292 6.573M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.75-.89 1.254-.998.527-.114.828-.93.828-.93-3.514 1.091-4.071 3.066-2.138 4.226 4.189 2.012 12.523 1.071 14.342-4.068M9.292 13.21s-2.491.598-883.959c0 0-.595-.128-1.329-.201 2.442-.641 5.836.149 9.065.467z';
        } else if (['html', 'htm'].includes(ext)) {
            color = '#E34F26'; // HTML orange
            iconPath = 'M5.484 6.046L5.993 11h7.964l-.25 2.5L12 13.85l-1.707-.35-.132-1.5H7.843l.303 3.3L12 16.256l3.856-.995.504-5.65H7.14l-.182-2.111H15.2l.15-1.5H6.328z';
        } else if (['css'].includes(ext)) {
            color = '#1572B6'; // CSS blue
            iconPath = 'M7.502 0h2.578v1.078h-1.5v1.078h1.5v1.078H7.502V0zm3.093 0h2.579v.938h-1.5v.187h1.5v2.156h-2.579v-.984h1.5v-.188h-1.5V0zm3.095 0h2.577v.938h-1.5v.187h1.5v2.156H13.69v-.984h1.5v-.188h-1.5V0zM11.995 4.5l-8.415 3.43 8.415 3.428 8.417-3.428z';
        } else if (['json', 'xml', 'yml', 'yaml'].includes(ext)) {
            color = '#8F8F8F'; // Gray for data files
            iconPath = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 8C6.12 11 5 9.88 5 8.5S6.12 6 7.5 6 10 7.12 10 8.5 8.88 11 7.5 11zm9 6c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
        } else {
            // Default file icon
            iconPath = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 4h7v5h5v11H6V4z';
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="${color}" stroke="currentColor" stroke-width="0.5">
            <path d="${iconPath}" />
        </svg>`;
    };

    return {
        /**
         * Initialize the component
         */
        init: init,

        /**
         * Get primary file name
         * @returns {string|null} Primary file name
         */
        getPrimaryFile: function() {
            return primaryFile;
        },

        /**
         * Get all project files
         * @returns {Array} Project files
         */
        getProjectFiles: function() {
            return projectFiles;
        },

        /**
         * Set primary file
         * @param {string} filename - Filename to set as primary
         */
        setPrimaryFile: setPrimaryFile
    };
})();