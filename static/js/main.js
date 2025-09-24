document.addEventListener('DOMContentLoaded', function() {
    // Initialize Socket.IO connection with reconnection settings
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    
    // DOM Elements
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const outputDiv = document.getElementById('output');
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const dockerStatus = document.getElementById('dockerStatus');
    const diskSpace = document.getElementById('diskSpace');
    const lastRun = document.getElementById('lastRun');
    const dockerImage = document.getElementById('dockerImage');
    const caseDir = document.getElementById('caseDir');
    const browseBtn = document.getElementById('browseBtn');
    const fileInput = document.getElementById('fileInput');
    const runDetails = document.getElementById('runDetails');
    const clearOutputBtn = document.getElementById('clearOutputBtn');
    const copyOutputBtn = document.getElementById('copyOutputBtn');
    const downloadOutputBtn = document.getElementById('downloadOutputBtn');
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    const lineCount = document.getElementById('lineCount');
    
    // State
    let isRunning = false;
    let currentRunId = null;
    let runStartTime = null;
    let runTimer = null;
    let autoScrollEnabled = true;
    let outputLines = 0;

    // Initialize the application
    async function init() {
        // Set up event listeners
        setupEventListeners();
        
        // Initial UI updates
        try {
            await Promise.all([
                checkDockerStatus(),
                checkDiskSpace()
            ]);
        } catch (error) {
            console.error('Error during initialization:', error);
        }
        updateLastRunTime();
    }

    // Set up all event listeners
    function setupEventListeners() {
        // Button click handlers
        runBtn.addEventListener('click', startSimulation);
        stopBtn.addEventListener('click', stopSimulation);
        browseBtn.addEventListener('click', () => fileInput.click());
        clearOutputBtn.addEventListener('click', clearOutput);
        copyOutputBtn.addEventListener('click', copyOutput);
        downloadOutputBtn.addEventListener('click', downloadOutput);
        autoScrollBtn.addEventListener('click', toggleAutoScroll);

        // File input handler
        fileInput.addEventListener('change', handleFileSelect);

        // Socket.IO event handlers
        socket.on('connect', handleSocketConnect);
        socket.on('disconnect', handleSocketDisconnect);
        socket.on('reconnect_attempt', handleReconnectAttempt);
        socket.on('reconnect', handleReconnect);
        socket.on('reconnect_error', handleReconnectError);
        socket.on('output', handleSocketOutput);
        socket.on('simulation_complete', handleSimulationComplete);
        socket.on('error', handleSocketError);

        // Page visibility change
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Auto-scroll observer
        const outputObserver = new MutationObserver(handleOutputMutation);
        outputObserver.observe(outputDiv, { childList: true });
    }

    // Socket.IO event handlers
    function handleSocketConnect() {
        console.log('Connected to WebSocket');
        updateSystemStatus('connected', 'Connected to server');
        showToast('Connected to server', 'success');
    }

    function handleSocketDisconnect(reason) {
        console.log('Disconnected:', reason);
        updateSystemStatus('disconnected', `Disconnected: ${reason}`);
        if (reason === 'io server disconnect') {
            socket.connect();
        }
    }

    function handleReconnectAttempt(attempt) {
        console.log(`Reconnection attempt ${attempt}`);
        updateSystemStatus('reconnecting', `Reconnecting (attempt ${attempt})`);
    }

    function handleReconnect(attempt) {
        console.log(`Reconnected after ${attempt} attempts`);
        updateSystemStatus('connected', 'Reconnected to server');
        showToast('Reconnected to server', 'success');
    }

    function handleReconnectError(error) {
        console.error('Reconnection error:', error);
        updateSystemStatus('error', 'Connection error');
    }

    function handleSocketOutput(data) {
        if (currentRunId && data.run_id === currentRunId) {
            appendOutput(data.data, data.timestamp);
            updateLineCount(1);
        }
    }

    function handleSimulationComplete(data) {
        if (data.run_id === currentRunId) {
            stopRunTimer();
            isRunning = false;
            setUIState(false);
            
            const status = data.exit_code === 0 ? 'success' : 'error';
            const message = data.exit_code === 0 
                ? '✅ Simulation completed successfully!'
                : `❌ Simulation failed with exit code ${data.exit_code}`;
            
            appendOutput(`\n\n${'='.repeat(80)}\n${message}\nDuration: ${formatDuration(data.duration)}\n`);
            
            updateLastRunTime();
            showToast(
                `Simulation ${data.exit_code === 0 ? 'completed' : 'failed'}`,
                status,
                data.exit_code === 0 ? 'check-circle' : 'exclamation-triangle'
            );
            
            showRunDetails(data);
        }
    }

    function handleSocketError(error) {
        console.error('Socket error:', error);
        appendOutput(`\n\n❌ SOCKET ERROR: ${error.message || 'Unknown error'}\n`, new Date().getTime(), 'error');
        showToast('Connection error', 'error', 'exclamation-circle');
    }

    // UI Event Handlers
    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            const path = e.target.files[0].webkitRelativePath;
            const directory = path.split('/')[0];
            caseDir.value = `./${directory}`;
            showToast(`Selected directory: ${directory}`, 'success');
        }
    }

    function handleOutputMutation() {
        if (autoScrollEnabled) {
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
    }

    function handleVisibilityChange() {
        if (!document.hidden) {
            checkDockerStatus();
            checkDiskSpace();
        }
    }

    // Core Functions
    async function startSimulation() {
        clearOutput();
        
        try {
            setUIState(true);
            appendOutput('🚀 Starting simulation...');
            
            currentRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const response = await fetch('/api/run_simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    docker_image: dockerImage.value,
                    case_dir: caseDir.value
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Failed to start simulation');
            }
            
            currentRunId = data.run_id;
            appendOutput(`✅ Simulation started with ID: ${data.run_id}`);
            appendOutput(`📂 Run directory: ${data.run_dir}`);
            
            if (runDetails) {
                runDetails.classList.add('hidden');
                runDetails.innerHTML = '';
            }
            
        } catch (error) {
            console.error('Error:', error);
            appendOutput(`❌ Error: ${error.message}`, null, 'error');
            setUIState(false);
        }
    }

    async function stopSimulation() {
        if (!isRunning) return;
        
        try {
            appendOutput('🛑 Stopping simulation...');
            
            const response = await fetch('/api/stop_simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_id: currentRunId })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Failed to stop simulation');
            }
            
            if (result.success) {
                appendOutput('✅ Simulation stopped by user');
                showToast('Simulation stopped', 'warning');
            } else {
                throw new Error(result.message || 'Failed to stop simulation');
            }
            
        } catch (error) {
            console.error('Error stopping simulation:', error);
            appendOutput(`❌ Error stopping simulation: ${error.message}`, null, 'error');
            showToast('Error stopping simulation', 'error');
        }
    }

    // UI Update Functions
    function setUIState(running) {
        isRunning = running;
        
        runBtn.disabled = running;
        stopBtn.disabled = !running;
        dockerImage.disabled = running;
        caseDir.readOnly = running;
        browseBtn.disabled = running;
        
        if (running) {
            statusText.textContent = 'Running';
            statusDot.className = 'flex-shrink-0 h-2 w-2 rounded-full bg-yellow-400 animate-pulse';
            runStartTime = Date.now();
            startRunTimer();
        } else {
            statusText.textContent = 'Idle';
            statusDot.className = 'flex-shrink-0 h-2 w-2 rounded-full bg-green-500';
            stopRunTimer();
        }
    }

    function updateSystemStatus(status, message) {
        const statusMap = {
            'connected': { 
                text: 'Connected', 
                dotClass: 'bg-green-500',
                textClass: 'text-green-600',
                icon: 'fa-check-circle'
            },
            'disconnected': { 
                text: 'Disconnected', 
                dotClass: 'bg-red-500',
                textClass: 'text-red-600',
                icon: 'fa-unlink'
            },
            'reconnecting': {
                text: 'Reconnecting...',
                dotClass: 'bg-yellow-500 animate-pulse',
                textClass: 'text-yellow-600',
                icon: 'fa-sync-alt fa-spin'
            },
            'error': { 
                text: 'Error', 
                dotClass: 'bg-red-500',
                textClass: 'text-red-600',
                icon: 'fa-exclamation-circle'
            }
        };
        
        const statusInfo = statusMap[status] || { 
            text: status, 
            dotClass: 'bg-gray-400',
            textClass: 'text-gray-600',
            icon: 'fa-info-circle'
        };
        
        if (statusDot) {
            statusDot.className = `flex-shrink-0 h-2 w-2 rounded-full ${statusInfo.dotClass}`;
        }
        
        if (statusText) {
            statusText.textContent = statusInfo.text;
            statusText.className = `text-sm ${statusInfo.textClass} font-medium`;
        }
    }

    // Output Management
    function appendOutput(text, timestamp = null, type = 'info') {
        if (!text) return;
        
        const lines = text.split('\n');
        
        lines.forEach((lineText, index) => {
            if (lineText.trim() === '' && index === lines.length - 1) return;
            
            const line = document.createElement('div');
            line.className = `output-line ${type} ${type === 'error' ? 'text-red-400' : 'text-gray-200'}`;
            
            if (timestamp && index === 0) {
                const timeElem = document.createElement('span');
                timeElem.className = 'timestamp text-gray-500 mr-2';
                timeElem.textContent = `[${new Date(timestamp).toLocaleTimeString()}]`;
                line.appendChild(timeElem);
            } else if (index > 0) {
                const indent = document.createElement('span');
                indent.className = 'inline-block w-6';
                line.appendChild(indent);
            }
            
            const content = document.createElement('span');
            content.className = 'content';
            content.textContent = lineText;
            line.appendChild(content);
            
            outputDiv.appendChild(line);
            outputLines++;
        });
        
        updateLineCount(0);
    }

    function clearOutput() {
        if (outputDiv.children.length > 0) {
            outputDiv.innerHTML = '';
            outputLines = 0;
            updateLineCount(0);
            showToast('Output cleared', 'info');
        }
    }

    function copyOutput() {
        const textToCopy = Array.from(outputDiv.children)
            .map(line => {
                const timestamp = line.querySelector('.timestamp');
                const content = line.querySelector('.content') || line;
                return `${timestamp ? timestamp.textContent + ' ' : ''}${content.textContent}`;
            })
            .join('\n');
            
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('Output copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy output', 'error');
        });
    }

    function downloadOutput() {
        const textToSave = Array.from(outputDiv.children)
            .map(line => {
                const timestamp = line.querySelector('.timestamp');
                const content = line.querySelector('.content') || line;
                return `${timestamp ? timestamp.textContent + ' ' : ''}${content.textContent}`;
            })
            .join('\n');
            
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openfoam-output-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Timer Functions
    function startRunTimer() {
        stopRunTimer();
        updateRunTimer();
        runTimer = setInterval(updateRunTimer, 1000);
    }
    
    function stopRunTimer() {
        if (runTimer) {
            clearInterval(runTimer);
            runTimer = null;
        }
    }
    
    function updateRunTimer() {
        if (!runStartTime) return;

        // Initialize plot if it doesn't exist
        if (!window.plotInitialized) {
            initializePlot();
        }
        
        // Update elapsed time and iteration
        updateElapsedTime();
        
        // Update plot data if we have new residuals
        if (window.hasNewResiduals) {
            updateResiduals();
        }
    }
    
    function initializePlot() {
        window.plotInitialized = true;
        
        // Create container for the plot
        const plotDiv = document.createElement('div');
        plotDiv.id = 'residual-plot';
        plotDiv.style.width = '100%';
        plotDiv.style.height = '400px';
        plotDiv.style.marginTop = '20px';
        
        const outputDiv = document.getElementById('output');
        if (outputDiv) {
            outputDiv.prepend(plotDiv);
        }
        
        // Initialize data storage if it doesn't exist
        if (!window.residualData) {
            window.residualData = {
                time: [],
                Ux: [], Uy: [], p: [], k: [], epsilon: []
            };
        }
        
        // Initialize the plot
        initPlot();
    }
    
    function initPlot() {
        if (typeof Plotly === 'undefined') {
            console.log('Waiting for Plotly to load...');
            setTimeout(initPlot, 100);
            return;
        }
        
        try {
            const traces = [
                { name: 'Ux', y: [], mode: 'lines+markers', line: {color: 'blue'} },
                { name: 'Uy', y: [], mode: 'lines+markers', line: {color: 'red'} },
                { name: 'p', y: [], mode: 'lines+markers', line: {color: 'green'} },
                { name: 'k', y: [], mode: 'lines+markers', line: {color: 'purple'} },
                { name: 'epsilon', y: [], mode: 'lines+markers', line: {color: 'orange'} }
            ];
            
            const layout = {
                title: 'Residuals vs Iteration',
                xaxis: { 
                    title: 'Iteration',
                    autorange: true
                },
                yaxis: { 
                    type: 'log', 
                    title: 'Residual',
                    autorange: true
                },
                showlegend: true,
                margin: { t: 30, l: 50, r: 30, b: 50 },
                legend: {
                    orientation: 'h',
                    y: 1.1,
                    x: 0.5,
                    xanchor: 'center',
                    traceorder: 'normal',
                    font: {
                        family: 'sans-serif',
                        size: 12,
                        color: '#000'
                    },
                    bgcolor: 'rgba(255, 255, 255, 0.7)',
                    bordercolor: '#ddd',
                    borderwidth: 1
                }
            };
            
            // Create new plot
            window.residualPlot = Plotly.newPlot('residual-plot', traces, layout);
            console.log('Plotly plot initialized');
            
            // Auto-resize the plot to fit its container
            setTimeout(() => {
                if (window.residualPlot) {
                    Plotly.Plots.resize('residual-plot');
                }
            }, 100);
            
        } catch (error) {
            console.error('Error initializing plot:', error);
        }
    }
    
    function updateElapsedTime() {
        if (!runStartTime) return;
        
        const elapsed = Math.floor((Date.now() - runStartTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        const timeStr = [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            seconds.toString().padStart(2, '0')
        ].join(':');
        
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = `Running (${timeStr}) - Iteration ${iteration}`;
        }
    }
    
    function updateResiduals() {
        if (!window.hasNewResiduals || !window.residualData) return;
        
        try {
            // Get current iteration count
            const currentIteration = window.residualData.time.length > 0 
                ? Math.max(...window.residualData.time) + 1 
                : 0;
            
            // Update time data
            window.residualData.time.push(currentIteration);
            
            // Update plot with new data
            updatePlot();
            
            // Reset the flag
            window.hasNewResiduals = false;
            
        } catch (error) {
            console.error('Error updating residuals:', error);
        }
    }
    
    function updatePlot() {
        if (typeof Plotly === 'undefined' || !window.residualPlot || !window.residualData) {
            return;
        }
        
        try {
            const traces = [];
            const colorMap = {
                'Ux': 'blue', 'Uy': 'red', 'p': 'green', 
                'k': 'purple', 'epsilon': 'orange'
            };
            
            // Create trace for each variable
            Object.entries(window.residualData).forEach(([varName, values]) => {
                if (varName !== 'time' && Array.isArray(values) && values.length > 0) {
                    traces.push({
                        x: Array.from({length: values.length}, (_, i) => i + 1),
                        y: values,
                        name: varName,
                        mode: 'lines+markers',
                        line: { color: colorMap[varName] || '#666' }
                    });
                }
            });
            
            // Update the plot
            Plotly.react('residual-plot', traces, {
                title: 'Residuals vs Iteration',
                xaxis: { 
                    title: 'Iteration',
                    autorange: true
                },
                yaxis: { 
                    type: 'log', 
                    title: 'Residual',
                    autorange: true
                },
                showlegend: true,
                margin: { t: 30, l: 50, r: 30, b: 50 },
                legend: {
                    orientation: 'h',
                    y: 1.1,
                    x: 0.5,
                    xanchor: 'center'
                }
            });
            
        } catch (error) {
            console.error('Error updating plot:', error);
        }
    }
    
    // Helper Functions
    async function checkDockerStatus() {
        try {
            const response = await fetch('/api/check_docker');
            const data = await response.json();
            
            if (data.running) {
                updateSystemStatus('connected', 'Docker is running');
                showToast('Docker is running', 'success');
            } else {
                updateSystemStatus('error', 'Docker is not running');
                showToast('Docker is not running', 'error');
            }
        } catch (error) {
            console.error('Error checking Docker status:', error);
            updateSystemStatus('error', 'Failed to check Docker status');
            showToast('Failed to check Docker status', 'error');
        }
    }
    
    async function checkDiskSpace() {
        try {
            const response = await fetch('/api/check_disk_space');
            const data = await response.json();
            
            if (data.available_gb < 5) {
                showToast(`Warning: Low disk space (${data.available_gb.toFixed(2)}GB available)`, 'warning');
            }
            
            // Update disk space indicator if it exists
            const diskSpaceElement = document.getElementById('disk-space');
            if (diskSpaceElement) {
                diskSpaceElement.textContent = `${data.available_gb.toFixed(2)}GB available`;
                diskSpaceElement.className = `text-xs ${data.available_gb < 5 ? 'text-yellow-500' : 'text-gray-500'}`;
            }
            
            return data.available_gb;
            
        } catch (error) {
            console.error('Error checking disk space:', error);
            showToast('Failed to check disk space', 'error');
            return null;
        }
    }
    
    function updateLastRunTime() {
        if (lastRun) {
            lastRun.textContent = new Date().toLocaleString();
        }
    }
    
    function updateLineCount(addedLines = 0) {
        if (lineCount) {
            outputLines += addedLines;
            lineCount.textContent = `${outputLines} line${outputLines !== 1 ? 's' : ''}`;
        }
    }
    
    function toggleAutoScroll() {
        autoScrollEnabled = !autoScrollEnabled;
        autoScrollBtn.classList.toggle('text-primary-500', autoScrollEnabled);
        autoScrollBtn.classList.toggle('text-gray-400', !autoScrollEnabled);
        autoScrollBtn.title = autoScrollEnabled ? 'Auto-scroll: ON' : 'Auto-scroll: OFF';
        
        if (autoScrollEnabled) {
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
        
        showToast(`Auto-scroll ${autoScrollEnabled ? 'enabled' : 'disabled'}`, 'info');
    }

    function showToast(message, type = 'info', icon = '') {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed bottom-4 right-4 z-50 space-y-2';
            document.body.appendChild(toastContainer);
        }
        
        const typeClasses = {
            info: 'bg-blue-100 border-blue-500 text-blue-700',
            success: 'bg-green-100 border-green-500 text-green-700',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
            error: 'bg-red-100 border-red-500 text-red-700'
        };
        
        const iconMap = {
            info: 'info-circle',
            success: 'check-circle',
            warning: 'exclamation-triangle',
            error: 'exclamation-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `flex items-center p-4 border-l-4 rounded shadow-lg ${typeClasses[type] || typeClasses.info} animate-fade-in`;
        
        const iconClass = icon || iconMap[type] || 'info-circle';
        
        toast.innerHTML = `
            <i class="fas fa-${iconClass} mr-3"></i>
            <span class="flex-grow">${message}</span>
            <button class="ml-4 text-gray-500 hover:text-gray-700" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        return [
            hours > 0 ? `${hours}h` : '',
            minutes > 0 ? `${minutes}m` : (hours > 0 ? '0m' : ''),
            `${secs}s`
        ].filter(Boolean).join(' ');
    }

    function showRunDetails(data) {
        if (!runDetails) return;
        
        const success = data.exit_code === 0;
        const duration = data.duration ? formatDuration(data.duration) : 'N/A';
        
        runDetails.innerHTML = `
            <div class="${success ? 'bg-green-50' : 'bg-red-50'} p-4 rounded-lg mt-4 border-l-4 ${success ? 'border-green-500' : 'border-red-500'}">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <i class="fas ${success ? 'fa-check-circle text-green-500' : 'fa-exclamation-circle text-red-500'} text-xl"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium ${success ? 'text-green-800' : 'text-red-800'}">
                            Simulation ${success ? 'Completed Successfully' : 'Failed'}
                        </h3>
                        <div class="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div class="flex">
                                <span class="text-gray-600 w-24">Run ID:</span>
                                <span class="font-mono text-gray-900">${data.run_id || 'N/A'}</span>
                            </div>
                            <div class="flex">
                                <span class="text-gray-600 w-24">Status:</span>
                                <span class="font-medium ${success ? 'text-green-700' : 'text-red-700'}">
                                    ${success ? 'Completed' : `Failed (Code: ${data.exit_code})`}
                                </span>
                            </div>
                            <div class="flex">
                                <span class="text-gray-600 w-24">Duration:</span>
                                <span>${duration}</span>
                            </div>
                            <div class="flex">
                                <span class="text-gray-600 w-24">Started:</span>
                                <span>${data.start_time ? new Date(data.start_time).toLocaleString() : 'N/A'}</span>
                            </div>
                            ${data.log_file ? `
                            <div class="sm:col-span-2 flex">
                                <span class="text-gray-600 w-24">Log File:</span>
                                <div class="flex-1 overflow-x-auto">
                                    <code class="text-xs bg-gray-100 p-1 rounded break-all">${data.log_file}</code>
                                </div>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
                ${success ? '' : `
                <div class="mt-4">
                    <button id="showErrorLogsBtn" class="text-sm text-${success ? 'green' : 'red'}-600 hover:text-${success ? 'green' : 'red'}-800 font-medium">
                        <i class="fas fa-chevron-down mr-1"></i> Show error details
                    </button>
                    <div id="errorLogs" class="mt-2 hidden bg-black bg-opacity-80 p-3 rounded text-xs font-mono text-red-300 max-h-40 overflow-y-auto"></div>
                </div>`}
            </div>
        `;
        
        runDetails.classList.remove('hidden');
        
        if (!success) {
            const showErrorLogsBtn = document.getElementById('showErrorLogsBtn');
            const errorLogs = document.getElementById('errorLogs');
            
            if (showErrorLogsBtn && errorLogs) {
                showErrorLogsBtn.addEventListener('click', () => {
                    const isHidden = errorLogs.classList.toggle('hidden');
                    showErrorLogsBtn.innerHTML = `
                        <i class="fas fa-chevron-${isHidden ? 'down' : 'up'} mr-1"></i>
                        ${isHidden ? 'Show' : 'Hide'} error details
                    `;
                    
                    if (!isHidden && errorLogs.children.length === 0) {
                        fetchErrorLogs(data.log_file, errorLogs);
                    }
                });
            }
        }
    }


    // Helper function to fetch error logs
    async function fetchErrorLogs(logFilePath, container) {
        if (!logFilePath) return;
        
        try {
            const response = await fetch(`/api/logs?path=${encodeURIComponent(logFilePath)}`);
            if (!response.ok) throw new Error('Failed to fetch logs');
            
            const logs = await response.text();
            container.textContent = logs || 'No error logs available';
        } catch (error) {
            console.error('Error fetching logs:', error);
            container.textContent = `Error loading logs: ${error.message}`;
        }
    }

    // Start the application
    init();
});

