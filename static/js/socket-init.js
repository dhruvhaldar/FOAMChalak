// Initialize Socket.IO when the page loads
function initSocketIO() {
    // Only initialize socket if not already connected and io is available
    if (!window.socket && typeof io !== 'undefined') {
        try {
            // Configure Socket.IO with optimizations
            window.socket = io({
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                transports: ['websocket', 'polling'],
                upgrade: true,
                forceNew: true
            });

            // Basic event handlers
            window.socket.on('connect', function() {
                console.log('Connected to server');
            });

            window.socket.on('disconnect', function(reason) {
                console.log('Disconnected from server:', reason);
            });

            // Error handling
            window.socket.on('connect_error', function(error) {
                console.error('Connection error:', error);
            });
        } catch (error) {
            console.error('Error initializing Socket.IO:', error);
        }
    } else if (typeof io === 'undefined') {
        // Retry initialization if io is not defined yet
        setTimeout(initSocketIO, 100);
    }
}

// Start initialization when the page loads
document.addEventListener('DOMContentLoaded', initSocketIO);
