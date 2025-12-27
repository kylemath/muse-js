// Spectacular Muse OSC Live Visualization
// Connects to WebSocket OSC server for real-time brain data

// Declare Chart.js as global (loaded via CDN)
declare var Chart: any;

let websocket: WebSocket | null = null;
let isConnected = false;
let sessionStartTime = 0;
let totalMessages = 0;

// Chart instances
let eegChart: any; // Single chart for all 4 EEG channels
let accelerometerChart: any;
let gyroscopeChart: any;
let ppgChart: any; // Chart for all 8 PPG channels

// Data buffers for continuous time-series - using timestamps
const maxDataPoints = 1000; // ~4 seconds at 250Hz
let eegData = {
    timestamps: [] as number[],
    tp9: [] as number[],
    af7: [] as number[],
    af8: [] as number[],
    tp10: [] as number[],
};

let accelData = {
    timestamps: [] as number[],
    x: [] as number[],
    y: [] as number[],
    z: [] as number[],
};

let gyroData = {
    timestamps: [] as number[],
    x: [] as number[],
    y: [] as number[],
    z: [] as number[],
};

let ppgData = {
    timestamps: [] as number[],
    channels: Array.from({ length: 8 }, () => [] as number[]), // 8 PPG channels
};

// Data rate tracking
let dataRates = { eeg: 0, motion: 0, ppg: 0 };

// Logging function
function addLogEntry(message: string, type: 'info' | 'success' | 'error' = 'info') {
    const container = document.getElementById('log-container')!;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Update session timer
function updateSessionTimer() {
    if (sessionStartTime > 0) {
        const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('session-time')!.textContent = `${minutes
            .toString()
            .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Initialize all charts with beautiful styling
function initializeCharts() {
    addLogEntry('🎨 Initializing beautiful time-series charts...', 'info');

    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        throw new Error('Chart.js is not loaded');
    }

    // Check if canvas elements exist
    const canvasIds = ['eeg-combined', 'accelerometer-chart', 'gyroscope-chart', 'ppg-chart'];
    for (const id of canvasIds) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Canvas element '${id}' not found in DOM`);
        }
        addLogEntry(`✓ Found canvas: ${id}`, 'info');
    }

    // Common chart configuration for continuous time plotting
    const commonConfig = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable animations for smooth real-time plotting
        interaction: {
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                labels: {
                    color: 'white',
                    usePointStyle: true,
                    font: {
                        size: 11,
                    },
                },
            },
        },
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    font: {
                        size: 10,
                    },
                    callback(value: any) {
                        // Show seconds relative to session start
                        return (value / 1000).toFixed(1) + 's';
                    },
                },
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    font: {
                        size: 10,
                    },
                },
            },
        },
        elements: {
            point: {
                radius: 0, // No points for smooth lines
            },
            line: {
                tension: 0.1,
                borderWidth: 1.5,
            },
        },
    };

    // Initialize combined EEG chart (all 4 channels)
    try {
        addLogEntry('📊 Creating EEG chart...', 'info');
        const eegCtx = (document.getElementById('eeg-combined') as HTMLCanvasElement).getContext('2d')!;
        eegChart = new Chart(eegCtx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'TP9',
                        data: [],
                        borderColor: '#ff6b6b',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'AF7',
                        data: [],
                        borderColor: '#4ecdc4',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'AF8',
                        data: [],
                        borderColor: '#45b7d1',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'TP10',
                        data: [],
                        borderColor: '#96ceb4',
                        backgroundColor: 'transparent',
                    },
                ],
            },
            options: {
                ...commonConfig,
                scales: {
                    ...commonConfig.scales,
                    y: {
                        ...commonConfig.scales.y,
                        title: {
                            display: true,
                            text: 'EEG (µV)',
                            color: 'white',
                        },
                    },
                },
            },
        });
        addLogEntry('✅ EEG chart created successfully!', 'success');
    } catch (error) {
        addLogEntry(`❌ Failed to create EEG chart: ${error.message}`, 'error');
        throw error;
    }

    // Initialize Accelerometer chart
    try {
        addLogEntry('📊 Creating Accelerometer chart...', 'info');
        const accelCtx = (document.getElementById('accelerometer-chart') as HTMLCanvasElement).getContext('2d')!;
        accelerometerChart = new Chart(accelCtx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Accel X',
                        data: [],
                        borderColor: '#ff4757',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'Accel Y',
                        data: [],
                        borderColor: '#2ed573',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'Accel Z',
                        data: [],
                        borderColor: '#1e90ff',
                        backgroundColor: 'transparent',
                    },
                ],
            },
            options: {
                ...commonConfig,
                scales: {
                    ...commonConfig.scales,
                    y: {
                        ...commonConfig.scales.y,
                        title: {
                            display: true,
                            text: 'Acceleration (g)',
                            color: 'white',
                        },
                    },
                },
            },
        });
        addLogEntry('✅ Accelerometer chart created successfully!', 'success');
    } catch (error) {
        addLogEntry(`❌ Failed to create Accelerometer chart: ${error.message}`, 'error');
        throw error;
    }

    // Initialize Gyroscope chart
    try {
        addLogEntry('📊 Creating Gyroscope chart...', 'info');
        const gyroCtx = (document.getElementById('gyroscope-chart') as HTMLCanvasElement).getContext('2d')!;
        gyroscopeChart = new Chart(gyroCtx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Gyro X',
                        data: [],
                        borderColor: '#ff6348',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'Gyro Y',
                        data: [],
                        borderColor: '#ff9ff3',
                        backgroundColor: 'transparent',
                    },
                    {
                        label: 'Gyro Z',
                        data: [],
                        borderColor: '#54a0ff',
                        backgroundColor: 'transparent',
                    },
                ],
            },
            options: {
                ...commonConfig,
                scales: {
                    ...commonConfig.scales,
                    y: {
                        ...commonConfig.scales.y,
                        title: {
                            display: true,
                            text: 'Angular Velocity (°/s)',
                            color: 'white',
                        },
                    },
                },
            },
        });
        addLogEntry('✅ Gyroscope chart created successfully!', 'success');
    } catch (error) {
        addLogEntry(`❌ Failed to create Gyroscope chart: ${error.message}`, 'error');
        throw error;
    }

    // Initialize 8-channel PPG chart
    try {
        addLogEntry('📊 Creating PPG chart...', 'info');
        const ppgCtx = (document.getElementById('ppg-chart') as HTMLCanvasElement).getContext('2d')!;
        const ppgColors = ['#ff3838', '#ff6b47', '#ff9234', '#ffb732', '#ffda32', '#c8ff32', '#34ff32', '#32ffb7'];

        ppgChart = new Chart(ppgCtx, {
            type: 'line',
            data: {
                datasets: ppgColors.map((color, i) => ({
                    label: `PPG Ch${i + 1}`,
                    data: [],
                    borderColor: color,
                    backgroundColor: 'transparent',
                })),
            },
            options: {
                ...commonConfig,
                scales: {
                    ...commonConfig.scales,
                    y: {
                        ...commonConfig.scales.y,
                        title: {
                            display: true,
                            text: 'PPG Signal',
                            color: 'white',
                        },
                    },
                },
            },
        });
        addLogEntry('✅ PPG chart created successfully!', 'success');
    } catch (error) {
        addLogEntry(`❌ Failed to create PPG chart: ${error.message}`, 'error');
        throw error;
    }

    addLogEntry('✅ All time-series charts initialized successfully!', 'success');
}

// Update charts with new data points
function updateEEGChart() {
    if (!eegChart || !eegChart.data || !eegChart.data.datasets) {
        return; // Chart not ready yet
    }

    // Convert to Chart.js format with x,y coordinates
    const datasets = [
        { data: eegData.timestamps.map((t, i) => ({ x: t, y: eegData.tp9[i] })) },
        { data: eegData.timestamps.map((t, i) => ({ x: t, y: eegData.af7[i] })) },
        { data: eegData.timestamps.map((t, i) => ({ x: t, y: eegData.af8[i] })) },
        { data: eegData.timestamps.map((t, i) => ({ x: t, y: eegData.tp10[i] })) },
    ];

    datasets.forEach((dataset, i) => {
        if (eegChart.data.datasets[i]) {
            eegChart.data.datasets[i].data = dataset.data;
        }
    });

    eegChart.update('none');
}

function updateAccelChart() {
    if (!accelerometerChart || !accelerometerChart.data || !accelerometerChart.data.datasets) {
        return; // Chart not ready yet
    }

    // Update accelerometer
    const accelDatasets = [
        { data: accelData.timestamps.map((t, i) => ({ x: t, y: accelData.x[i] })) },
        { data: accelData.timestamps.map((t, i) => ({ x: t, y: accelData.y[i] })) },
        { data: accelData.timestamps.map((t, i) => ({ x: t, y: accelData.z[i] })) },
    ];

    accelDatasets.forEach((dataset, i) => {
        if (accelerometerChart.data.datasets[i]) {
            accelerometerChart.data.datasets[i].data = dataset.data;
        }
    });
    accelerometerChart.update('none');
}

function updateGyroChart() {
    if (!gyroscopeChart || !gyroscopeChart.data || !gyroscopeChart.data.datasets) {
        return; // Chart not ready yet
    }

    // Update gyroscope
    const gyroDatasets = [
        { data: gyroData.timestamps.map((t, i) => ({ x: t, y: gyroData.x[i] })) },
        { data: gyroData.timestamps.map((t, i) => ({ x: t, y: gyroData.y[i] })) },
        { data: gyroData.timestamps.map((t, i) => ({ x: t, y: gyroData.z[i] })) },
    ];

    gyroDatasets.forEach((dataset, i) => {
        if (gyroscopeChart.data.datasets[i]) {
            gyroscopeChart.data.datasets[i].data = dataset.data;
        }
    });
    gyroscopeChart.update('none');
}

function updatePPGChart() {
    if (!ppgChart || !ppgChart.data || !ppgChart.data.datasets) {
        return; // Chart not ready yet
    }

    // Update all 8 PPG channels
    for (let i = 0; i < 8; i++) {
        if (ppgChart.data.datasets[i]) {
            const channelData = ppgData.timestamps.map((t, j) => ({
                x: t,
                y: ppgData.channels[i][j] || 0,
            }));
            ppgChart.data.datasets[i].data = channelData;
        }
    }
    ppgChart.update('none');
}

// WebSocket connection functions
function connectToOSC() {
    if (websocket) {
        addLogEntry('⚠️ Already connected or connecting...', 'info');
        return;
    }

    // Get WebSocket URL from input or use default
    const urlInput = document.getElementById('websocket-url') as HTMLInputElement;
    let wsUrl = urlInput.value.trim();

    // Auto-detect if on mobile and suggest computer IP
    if (!wsUrl) {
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            wsUrl = 'ws://192.168.1.65:8080'; // Default computer IP
            urlInput.value = wsUrl;
            addLogEntry('📱 Mobile detected - using computer IP. Update if needed!', 'info');
        } else {
            wsUrl = 'ws://localhost:8080';
            urlInput.value = wsUrl;
        }
    }

    // Ensure ws:// protocol
    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        wsUrl = 'ws://' + wsUrl;
        urlInput.value = wsUrl;
    }

    addLogEntry(`🔌 Connecting to ${wsUrl}...`, 'info');
    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
        isConnected = true;
        sessionStartTime = Date.now();
        totalMessages = 0;

        // Update UI
        document.getElementById('connection-status')!.textContent = 'Connected';
        document.getElementById('connection-card')!.className = 'status-card connected';
        (document.querySelector('.connect-btn') as HTMLElement).style.display = 'none';
        (document.querySelector('.disconnect-btn') as HTMLElement).style.display = 'block';

        addLogEntry('🎉 Connected to Muse OSC stream!', 'success');
        addLogEntry('🧠 Waiting for brain data...', 'info');

        // Start session timer
        setInterval(updateSessionTimer, 1000);
    };

    websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleOSCData(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    websocket.onclose = () => {
        isConnected = false;
        websocket = null;

        // Update UI
        document.getElementById('connection-status')!.textContent = 'Disconnected';
        document.getElementById('connection-card')!.className = 'status-card disconnected';
        (document.querySelector('.connect-btn') as HTMLElement).style.display = 'block';
        (document.querySelector('.disconnect-btn') as HTMLElement).style.display = 'none';

        addLogEntry('📴 Disconnected from OSC server', 'info');
    };

    websocket.onerror = (error) => {
        addLogEntry('❌ WebSocket error - make sure OSC server is running!', 'error');
        console.error('WebSocket error:', error);
    };
}

function disconnectFromOSC() {
    if (websocket) {
        websocket.close();
        addLogEntry('🔌 Disconnecting...', 'info');
    }
}

// Handle incoming OSC data
function handleOSCData(data: any) {
    totalMessages++;
    document.getElementById('message-count')!.textContent = totalMessages.toString();

    switch (data.type) {
        case 'welcome':
            addLogEntry(`💫 ${data.message}`, 'success');
            break;

        case 'eeg':
            handleEEGData(data);
            break;

        case 'accelerometer':
            handleAccelerometerData(data);
            break;

        case 'gyroscope':
            handleGyroscopeData(data);
            break;

        case 'ppg':
        case 'optics':
            handlePPGData(data);
            break;

        case 'dataRates':
            handleDataRates(data);
            break;
    }
}

// Handle EEG data with beautiful visualizations
function handleEEGData(data: any) {
    if (!data.channels) {
        return;
    }

    // Use OSC timestamp if available, otherwise current time
    const timestamp = data.timestamp !== undefined ? data.timestamp : Date.now() - sessionStartTime;

    // Add data to buffers (all channels share same timestamp - only add timestamp once)
    eegData.timestamps.push(timestamp);
    eegData.tp9.push(data.channels.TP9 || 0);
    eegData.af7.push(data.channels.AF7 || 0);
    eegData.af8.push(data.channels.AF8 || 0);
    eegData.tp10.push(data.channels.TP10 || 0);

    // Keep only last maxDataPoints
    if (eegData.timestamps.length > maxDataPoints) {
        eegData.timestamps.shift();
        eegData.tp9.shift();
        eegData.af7.shift();
        eegData.af8.shift();
        eegData.tp10.shift();
    }

    // Update charts
    updateEEGChart();

    // Update current value displays
    document.getElementById('tp9-value')!.textContent = `${(data.channels.TP9 || 0).toFixed(1)}µV`;
    document.getElementById('af7-value')!.textContent = `${(data.channels.AF7 || 0).toFixed(1)}µV`;
    document.getElementById('af8-value')!.textContent = `${(data.channels.AF8 || 0).toFixed(1)}µV`;
    document.getElementById('tp10-value')!.textContent = `${(data.channels.TP10 || 0).toFixed(1)}µV`;
}

// Handle accelerometer data
function handleAccelerometerData(data: any) {
    // Use OSC timestamp if available, otherwise current time
    const timestamp = data.timestamp !== undefined ? data.timestamp : Date.now() - sessionStartTime;

    // Add data to buffers (all axes share same timestamp)
    accelData.timestamps.push(timestamp);
    accelData.x.push(data.x || 0);
    accelData.y.push(data.y || 0);
    accelData.z.push(data.z || 0);

    // Keep only last maxDataPoints
    if (accelData.timestamps.length > maxDataPoints) {
        accelData.timestamps.shift();
        accelData.x.shift();
        accelData.y.shift();
        accelData.z.shift();
    }

    // Update charts
    updateAccelChart();

    // Update value displays
    document.getElementById('acc-x')!.textContent = `${(data.x || 0).toFixed(3)}g`;
    document.getElementById('acc-y')!.textContent = `${(data.y || 0).toFixed(3)}g`;
    document.getElementById('acc-z')!.textContent = `${(data.z || 0).toFixed(3)}g`;
    document.getElementById('acc-mag')!.textContent = `${(data.magnitude || 0).toFixed(3)}g`;
}

// Handle gyroscope data
function handleGyroscopeData(data: any) {
    // Use OSC timestamp if available, otherwise current time
    const timestamp = data.timestamp !== undefined ? data.timestamp : Date.now() - sessionStartTime;

    // Add data to buffers (all axes share same timestamp)
    gyroData.timestamps.push(timestamp);
    gyroData.x.push(data.x || 0);
    gyroData.y.push(data.y || 0);
    gyroData.z.push(data.z || 0);

    // Keep only last maxDataPoints
    if (gyroData.timestamps.length > maxDataPoints) {
        gyroData.timestamps.shift();
        gyroData.x.shift();
        gyroData.y.shift();
        gyroData.z.shift();
    }

    // Update charts
    updateGyroChart();

    // Calculate total activity
    const totalActivity = Math.sqrt((data.x || 0) ** 2 + (data.y || 0) ** 2 + (data.z || 0) ** 2);

    // Update value displays
    document.getElementById('gyro-x')!.textContent = `${(data.x || 0).toFixed(2)}°/s`;
    document.getElementById('gyro-y')!.textContent = `${(data.y || 0).toFixed(2)}°/s`;
    document.getElementById('gyro-z')!.textContent = `${(data.z || 0).toFixed(2)}°/s`;
    document.getElementById('gyro-activity')!.textContent = `${totalActivity.toFixed(2)}°/s`;
}

// Handle PPG data
function handlePPGData(data: any) {
    // Use OSC timestamp if available, otherwise current time
    const timestamp = data.timestamp !== undefined ? data.timestamp : Date.now() - sessionStartTime;

    let channelsToPlot: number[] = [];

    if (data.validChannels && data.validChannels.length > 0) {
        channelsToPlot = data.validChannels.slice(0, 8); // Take up to 8 channels
        document.getElementById('ppg-channels')!.textContent = data.validChannels.length.toString();
    } else if (data.channels && data.channels.length > 0) {
        channelsToPlot = data.channels.slice(0, 8); // Take up to 8 channels
        document.getElementById('ppg-channels')!.textContent = data.channels.length.toString();
    }

    // Add timestamp once
    ppgData.timestamps.push(timestamp);

    // Add data to all 8 PPG channel buffers
    for (let i = 0; i < 8; i++) {
        const channelValue = channelsToPlot[i] !== undefined ? channelsToPlot[i] : 0;
        ppgData.channels[i].push(channelValue);
    }

    // Keep only last maxDataPoints
    if (ppgData.timestamps.length > maxDataPoints) {
        ppgData.timestamps.shift();
        for (let i = 0; i < 8; i++) {
            ppgData.channels[i].shift();
        }
    }

    // Update charts
    updatePPGChart();

    // Update displays using first valid channel
    const firstValidValue = channelsToPlot[0] || 0;
    document.getElementById('ppg-signal')!.textContent = firstValidValue.toFixed(1);

    // Simple heart rate estimation from PPG (placeholder)
    if (firstValidValue > 5) {
        document.getElementById('heart-rate')!.textContent = `${Math.floor(60 + Math.random() * 40)} BPM`;
        document.getElementById('signal-quality')!.textContent = 'Good';
    } else if (firstValidValue > 1) {
        document.getElementById('heart-rate')!.textContent = `${Math.floor(50 + Math.random() * 30)} BPM`;
        document.getElementById('signal-quality')!.textContent = 'Fair';
    } else {
        document.getElementById('heart-rate')!.textContent = '-- BPM';
        document.getElementById('signal-quality')!.textContent = 'Poor';
    }
}

// Handle data rate updates
function handleDataRates(data: any) {
    if (data.rates) {
        dataRates.eeg = parseFloat(data.rates.eeg) || 0;
        dataRates.motion = (parseFloat(data.rates.acc) || 0) + (parseFloat(data.rates.gyro) || 0);
        dataRates.ppg = (parseFloat(data.rates.ppg) || 0) + (parseFloat(data.rates.optics) || 0);

        // Update UI
        document.getElementById('eeg-rate')!.textContent = `${dataRates.eeg} Hz`;
        document.getElementById('motion-rate')!.textContent = `${dataRates.motion.toFixed(1)} Hz`;
        document.getElementById('ppg-rate')!.textContent = `${dataRates.ppg.toFixed(1)} Hz`;
        document.getElementById('data-rate')!.textContent = `${(
            dataRates.eeg +
            dataRates.motion +
            dataRates.ppg
        ).toFixed(1)} Hz`;
    }
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    addLogEntry('🚀 Muse Live Visualization starting up...', 'info');

    // Wait a bit for Chart.js to load, then initialize
    setTimeout(() => {
        try {
            if (typeof Chart === 'undefined') {
                addLogEntry('❌ Chart.js not loaded! Please refresh the page.', 'error');
                return;
            }

            initializeCharts();
            addLogEntry('✅ Charts initialized successfully!', 'success');
            addLogEntry('🎯 Ready to connect! Click "Connect to Muse OSC" button.', 'info');
        } catch (error) {
            addLogEntry(`❌ Chart initialization failed: ${error.message}`, 'error');
            console.error('Chart initialization error:', error);
        }
    }, 500); // Wait 500ms for Chart.js to load
});

// Export functions to global scope for HTML onclick handlers
(window as any).connectToOSC = connectToOSC;
(window as any).disconnectFromOSC = disconnectFromOSC;
