// Initialize variables
let socket;
let sessionId;
let currentFilePath = null;
let isProcessing = false;
let currentStreamingMessage = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-btn');
const fileUpload = document.getElementById('file-upload');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const clearFileBtn = document.getElementById('clear-file');

// Initialize app
async function initApp() {
    // Create a new session
    try {
        const response = await fetch('/api/sessions', {
            method: 'POST'
        });
        const data = await response.json();
        sessionId = data.session_id;

        // Connect to socket
        connectSocket();
    } catch (error) {
        showError('Failed to initialize: ' + error.message);
    }
}

// Connect to WebSocket
function connectSocket() {
    // If socket exists and is connected, don't reconnect
    if (socket && socket.connected) {
        console.log('Socket already connected');
        return;
    }

    // Create new socket connection
    socket = io();

    socket.on('connect', () => {
        console.log('Socket connected, joining session:', sessionId);
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        socket.emit('join_session', {session_id: sessionId});
    });

    socket.on('session_joined', (data) => {
        if (data.status === 'success') {
            console.log('Joined session successfully');
        } else {
            showError('Failed to join session: ' + data.message);
        }
    });

    socket.on('message_received', (data) => {
        if (data.status === 'processing') {
            isProcessing = true;
            // Create an empty container for streaming response
            addProcessingIndicator();

            // Initialize an empty streaming message container
            currentStreamingMessage = '';
        }
    });

    // Handle streaming chunks
    socket.on('assistant_chunk', (data) => {
        if (currentStreamingMessage !== null) {
            // Append new chunk to current message
            currentStreamingMessage += data.content;

            // Update the streaming message container
            updateStreamingMessage(currentStreamingMessage);
        }
    });

    // Handle complete message (legacy support)
    socket.on('assistant_response', (data) => {
        console.log('Received complete message event');
        isProcessing = false;

        if (data.complete) {
            console.log('Handling complete message (non-streaming)');
            // This is a complete message (not a chunk)
            removeProcessingIndicator();
            addMessage('assistant', data.content);
            scrollToBottom();
            currentStreamingMessage = null;
        }
    });

    // Handle message completion signal
    socket.on('assistant_response_complete', (data) => {
        console.log('Response complete, finalizing message with content:', currentStreamingMessage?.substring(0, 50) + '...');
        isProcessing = false;

        // This is the critical part - ensure we have message content
        if (currentStreamingMessage && currentStreamingMessage.trim().length > 0) {
            // Store the message content in a local variable to ensure it doesn't get cleared
            const messageContent = currentStreamingMessage;

            // Convert the streaming message container to a proper message
            removeProcessingIndicator();
            addMessage('assistant', messageContent);
            scrollToBottom();
        } else {
            console.log('Warning: No streaming message content to finalize');
            removeProcessingIndicator();
        }

        // Reset streaming message state after finalizing
        currentStreamingMessage = null;
    });

    socket.on('error', (data) => {
        isProcessing = false;
        removeProcessingIndicator();
        currentStreamingMessage = null;
        showError(data.message);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        // Try to reconnect if disconnected
        tryReconnect();
    });
}

// Try to reconnect the socket
function tryReconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
        setTimeout(() => {
            connectSocket();
        }, 1000 * reconnectAttempts); // Increasing backoff
    } else {
        showError('Lost connection to server. Please refresh the page.');
    }
}

// Send a message
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isProcessing) return;

    // Ensure socket is connected
    if (!socket || !socket.connected) {
        console.log('Socket not connected, attempting to reconnect...');
        connectSocket();
        showError('Connection to server lost. Trying to reconnect...');
        return;
    }

    addMessage('user', message);
    messageInput.value = '';
    scrollToBottom();

    socket.emit('user_message', {
        session_id: sessionId,
        message: message,
        file_path: currentFilePath
    });
}

// Upload a file
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        // Show uploading status
        showToast('Uploading file...');

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.error) {
            showError(data.error);
            return;
        }

        // Update UI and store file path
        currentFilePath = data.file_path;
        fileName.textContent = data.filename;
        fileInfo.classList.remove('hidden');

        // Show success message
        showToast(`File uploaded: ${data.filename}`);

        // Make sure we're still connected to our session
        ensureSocketConnection();
    } catch (error) {
        showError('Failed to upload file: ' + error.message);
    }
}

// Ensure socket connection is active
function ensureSocketConnection() {
    console.log('Checking socket connection...');

    if (!socket || !socket.connected) {
        console.log('Socket not connected, reconnecting...');
        connectSocket();

        // If we have a session ID, rejoin the session
        if (sessionId) {
            console.log('Rejoining session:', sessionId);
            setTimeout(() => {
                socket.emit('join_session', {session_id: sessionId});
            }, 500); // Short delay to ensure socket is ready
        }
    } else {
        console.log('Socket connection is active');
    }
}

// Add a message to the chat
function addMessage(role, content) {
    // Remove processing indicator if it exists
    removeProcessingIndicator();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-container ${role === 'user' ? 'bg-gray-50' : 'bg-white'}`;

    // Avatar and identifier
    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'flex-shrink-0 mr-4';

    const avatar = document.createElement('div');
    avatar.className = `h-8 w-8 rounded-full flex items-center justify-center ${role === 'user' ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}`;
    avatar.innerHTML = role === 'user' ? 'U' : 'AI';

    avatarContainer.appendChild(avatar);

    // Message content
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    // Parse markdown using marked
    const parsedContent = marked.parse(content);
    messageContent.innerHTML = parsedContent;

    // Add copy buttons to code blocks
    const codeBlocks = messageContent.querySelectorAll('pre code');
    codeBlocks.forEach(codeBlock => {
        // Apply syntax highlighting
        hljs.highlightElement(codeBlock);

        // Create copy button
        const pre = codeBlock.parentElement;
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-btn';
        copyButton.textContent = 'Copy';
        copyButton.onclick = () => {
            navigator.clipboard.writeText(codeBlock.textContent)
                .then(() => {
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => {
                        copyButton.textContent = 'Copy';
                    }, 1500);
                });
        };

        pre.appendChild(copyButton);
    });

    messageDiv.appendChild(avatarContainer);
    messageDiv.appendChild(messageContent);
    messagesContainer.appendChild(messageDiv);
}

// Add processing indicator
function addProcessingIndicator() {
    // Remove existing indicator if any
    removeProcessingIndicator();

    const indicator = document.createElement('div');
    indicator.id = 'processing-indicator';
    indicator.className = 'message-container bg-white';

    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'flex-shrink-0 mr-4';

    const avatar = document.createElement('div');
    avatar.className = 'h-8 w-8 rounded-full flex items-center justify-center bg-green-100 text-green-800';
    avatar.innerHTML = 'AI';

    avatarContainer.appendChild(avatar);

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content flex items-center';

    // Add the animated dots while waiting for the first chunk
    const dots = document.createElement('div');
    dots.id = 'streaming-dots';
    dots.className = 'flex space-x-2';
    dots.innerHTML = `
        <div class="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0s"></div>
        <div class="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
        <div class="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
    `;

    // Create a separate div for the streamed content
    const streamingContent = document.createElement('div');
    streamingContent.id = 'streaming-content';
    streamingContent.className = 'w-full mt-2';
    streamingContent.style.display = 'none'; // Hidden initially

    messageContent.appendChild(dots);
    messageContent.appendChild(streamingContent);
    indicator.appendChild(avatarContainer);
    indicator.appendChild(messageContent);
    messagesContainer.appendChild(indicator);
}

// Update streaming message with new content
function updateStreamingMessage(content) {
    const streamingContent = document.getElementById('streaming-content');
    const dots = document.getElementById('streaming-dots');

    if (streamingContent) {
        // Hide the dots and show the content on first update
        if (streamingContent.style.display === 'none') {
            if (dots) dots.style.display = 'none';
            streamingContent.style.display = 'block';
        }

        // Parse markdown for the current streamed content
        streamingContent.innerHTML = marked.parse(content);

        // Apply syntax highlighting to any code blocks
        const codeBlocks = streamingContent.querySelectorAll('pre code');
        codeBlocks.forEach(codeBlock => {
            hljs.highlightElement(codeBlock);
        });

        // Scroll to bottom to follow the streaming text
        scrollToBottom();
    }
}

// Remove processing indicator
function removeProcessingIndicator() {
    const indicator = document.getElementById('processing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded';
    errorDiv.innerHTML = `<p>${message}</p>`;

    // Add to messages container
    messagesContainer.appendChild(errorDiv);
    scrollToBottom();

    // Remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Show toast message
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    document.body.appendChild(toast);

    // Remove after animation completes
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Scroll to bottom of messages
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initApp();

    // Send button click
    sendButton.addEventListener('click', sendMessage);

    // Send on Enter key (but allow Shift+Enter for new lines)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // File upload
    fileUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });

    // Clear file button
    clearFileBtn.addEventListener('click', () => {
        currentFilePath = null;
        fileInfo.classList.add('hidden');
        fileName.textContent = '';
        fileUpload.value = '';
    });
});