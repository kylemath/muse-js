const dgram = require('dgram');
const WebSocket = require('ws');
const http = require('http');

console.log('🎪 Starting Enhanced Muse OSC WebSocket Server...');
console.log('📡 OSC Input: port 5001 | 🌐 WebSocket: port 8080\n');

// Create UDP server for OSC
const oscServer = dgram.createSocket('udp4');

// Create HTTP server and WebSocket server
const httpServer = http.createServer();
const wss = new WebSocket.Server({ server: httpServer });

let messageCount = 0;
let lastTimestamp = Date.now();
let connectedClients = 0;
let sessionStartTime = Date.now(); // Track session start for relative timestamps

// Data rate tracking
let dataRates = {
    eeg: 0,
    acc: 0,
    gyro: 0,
    ppg: 0,
    optics: 0,
    drlref: 0,
};
let lastRateUpdate = Date.now();

// Store latest data for new connections
let latestData = {
    eeg: null,
    acc: null,
    gyro: null,
    ppg: null,
    optics: null,
    drlref: null,
};

// WebSocket connection handling
wss.on('connection', (ws) => {
    connectedClients++;
    console.log(`🔗 New client connected! Total clients: ${connectedClients}`);

    // Reset session start time for first client
    if (connectedClients === 1) {
        sessionStartTime = Date.now();
        console.log(`📅 New session started at ${new Date(sessionStartTime).toLocaleTimeString()}`);
    }

    // Send welcome message and current data rates
    ws.send(
        JSON.stringify({
            type: 'welcome',
            message: 'Connected to Muse OSC Stream',
            dataRates: dataRates,
            timestamp: Date.now() - sessionStartTime,
            sessionStartTime: sessionStartTime,
        }),
    );

    // Send any existing data
    Object.entries(latestData).forEach(([type, data]) => {
        if (data) {
            ws.send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        connectedClients--;
        console.log(`📴 Client disconnected. Remaining clients: ${connectedClients}`);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Function to format timestamp
function getTimestamp() {
    const now = new Date();
    return (
        now.toTimeString().split(' ')[0] +
        '.' +
        now
            .getMilliseconds()
            .toString()
            .padStart(3, '0')
    );
}

// Function to parse IEEE 754 32-bit float from buffer (big-endian)
function parseFloat32BE(buffer, offset) {
    return buffer.readFloatBE(offset);
}

// Function to parse OSC string (null-terminated, padded to 4-byte boundary)
function parseOSCString(buffer, offset) {
    let str = '';
    let i = offset;
    while (i < buffer.length && buffer[i] !== 0) {
        str += String.fromCharCode(buffer[i]);
        i++;
    }
    const padded = Math.ceil((str.length + 1) / 4) * 4;
    return { value: str, nextOffset: offset + padded };
}

// Function to parse OSC type tag string
function parseOSCTypeTag(buffer, offset) {
    let tag = '';
    let i = offset;
    while (i < buffer.length && buffer[i] !== 0) {
        tag += String.fromCharCode(buffer[i]);
        i++;
    }
    const padded = Math.ceil((tag.length + 1) / 4) * 4;
    return { value: tag, nextOffset: offset + padded };
}

// Function to parse complete OSC message
function parseOSCMessage(buffer) {
    try {
        const address = parseOSCString(buffer, 0);
        const typeTag = parseOSCTypeTag(buffer, address.nextOffset);

        const args = [];
        let offset = typeTag.nextOffset;

        for (let i = 1; i < typeTag.value.length; i++) {
            const type = typeTag.value[i];
            if (type === 'f') {
                if (offset + 4 <= buffer.length) {
                    args.push(parseFloat32BE(buffer, offset));
                    offset += 4;
                }
            }
        }

        return {
            address: address.value,
            types: typeTag.value,
            args: args,
        };
    } catch (error) {
        return null;
    }
}

// Function to broadcast data to all WebSocket clients
function broadcastData(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Function to process and broadcast sensor data
function processSensorData(address, args) {
    const timestamp = Date.now();
    const relativeTimestamp = timestamp - sessionStartTime; // Relative to session start
    const timeDiff = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    let data = null;

    switch (true) {
        case address.includes('/eeg'):
            if (args.length >= 4) {
                dataRates.eeg++;
                data = {
                    type: 'eeg',
                    timestamp: relativeTimestamp,
                    absoluteTimestamp: timestamp,
                    timeDiff: timeDiff,
                    channels: {
                        TP9: args[0],
                        AF7: args[1],
                        AF8: args[2],
                        TP10: args[3],
                    },
                    values: args.slice(0, 4),
                };
                latestData.eeg = data;
                console.log(
                    `🧠 EEG: TP9=${args[0].toFixed(1)}µV AF7=${args[1].toFixed(1)}µV AF8=${args[2].toFixed(
                        1,
                    )}µV TP10=${args[3].toFixed(1)}µV`,
                );
            }
            break;

        case address.includes('/acc'):
            if (args.length >= 3) {
                dataRates.acc++;
                const magnitude = Math.sqrt(args[0] * args[0] + args[1] * args[1] + args[2] * args[2]);
                data = {
                    type: 'accelerometer',
                    timestamp: relativeTimestamp,
                    absoluteTimestamp: timestamp,
                    timeDiff: timeDiff,
                    x: args[0],
                    y: args[1],
                    z: args[2],
                    magnitude: magnitude,
                    values: args.slice(0, 3),
                };
                latestData.acc = data;
                console.log(
                    `📱 Accelerometer: X=${args[0].toFixed(3)}g Y=${args[1].toFixed(3)}g Z=${args[2].toFixed(3)}g`,
                );
            }
            break;

        case address.includes('/gyro'):
            if (args.length >= 3) {
                dataRates.gyro++;
                data = {
                    type: 'gyroscope',
                    timestamp: relativeTimestamp,
                    absoluteTimestamp: timestamp,
                    timeDiff: timeDiff,
                    x: args[0],
                    y: args[1],
                    z: args[2],
                    values: args.slice(0, 3),
                };
                latestData.gyro = data;
                console.log(
                    `🌀 Gyroscope: X=${args[0].toFixed(2)}°/s Y=${args[1].toFixed(2)}°/s Z=${args[2].toFixed(2)}°/s`,
                );
            }
            break;

        case address.includes('/optics'):
            dataRates.optics++;
            data = {
                type: 'optics',
                timestamp: relativeTimestamp,
                absoluteTimestamp: timestamp,
                timeDiff: timeDiff,
                channels: args.slice(0, 8), // Support up to 8 channels
                validChannels: args.slice(0, 8).filter((val) => !isNaN(val)),
                values: args,
            };
            latestData.optics = data;
            console.log(
                `💡 PPG/Optics: ${args
                    .slice(0, Math.min(4, args.length))
                    .map((v) => v.toFixed(1))
                    .join(' | ')}`,
            );
            break;

        case address.includes('/ppg'):
            dataRates.ppg++;
            const validPPG = args.filter((val) => !isNaN(val));
            if (validPPG.length > 0) {
                data = {
                    type: 'ppg',
                    timestamp: relativeTimestamp,
                    absoluteTimestamp: timestamp,
                    timeDiff: timeDiff,
                    channels: args.slice(0, 8), // Support up to 8 channels
                    validChannels: validPPG.slice(0, 8), // Limit to 8 channels
                    rawValues: args,
                    values: validPPG,
                };
                latestData.ppg = data;
                console.log(
                    `💓 PPG: ${validPPG
                        .slice(0, 4)
                        .map((v) => v.toFixed(1))
                        .join(' | ')}`,
                );
            }
            break;

        case address.includes('/drlref'):
            if (args.length >= 2) {
                dataRates.drlref++;
                data = {
                    type: 'drlref',
                    timestamp: relativeTimestamp,
                    absoluteTimestamp: timestamp,
                    timeDiff: timeDiff,
                    drl: args[0],
                    ref: args[1],
                    values: args.slice(0, 2),
                };
                latestData.drlref = data;
                console.log(`🔗 DRL/REF: DRL=${args[0].toFixed(1)} REF=${args[1].toFixed(1)}`);
            }
            break;
    }

    // Broadcast to all connected clients
    if (data && connectedClients > 0) {
        broadcastData(data);
    }

    return data;
}

// Function to display and broadcast data rates
function displayDataRates() {
    const now = Date.now();
    const elapsed = (now - lastRateUpdate) / 1000;

    if (elapsed >= 3.0) {
        // Update every 3 seconds
        const rates = {
            eeg: (dataRates.eeg / elapsed).toFixed(1),
            acc: (dataRates.acc / elapsed).toFixed(1),
            gyro: (dataRates.gyro / elapsed).toFixed(1),
            ppg: (dataRates.ppg / elapsed).toFixed(1),
            optics: (dataRates.optics / elapsed).toFixed(1),
            drlref: (dataRates.drlref / elapsed).toFixed(1),
        };

        console.log('\n📊 ═══════ LIVE DATA RATES ═══════');
        console.log(`🧠 EEG: ${rates.eeg} Hz | 📱 Accel: ${rates.acc} Hz | 🌀 Gyro: ${rates.gyro} Hz`);
        console.log(`💓 PPG: ${rates.ppg} Hz | 💡 Optics: ${rates.optics} Hz | 🔗 DRL: ${rates.drlref} Hz`);
        console.log(`📦 Total: ${messageCount} messages | 🔗 Clients: ${connectedClients}`);
        console.log('════════════════════════════════════\n');

        // Broadcast data rates to clients
        if (connectedClients > 0) {
            broadcastData({
                type: 'dataRates',
                timestamp: now,
                rates: rates,
                totalMessages: messageCount,
                connectedClients: connectedClients,
            });
        }

        // Reset counters
        dataRates = { eeg: 0, acc: 0, gyro: 0, ppg: 0, optics: 0, drlref: 0 };
        lastRateUpdate = now;
    }
}

// OSC message handling
oscServer.on('message', (msg, rinfo) => {
    messageCount++;

    const parsed = parseOSCMessage(msg);

    if (parsed) {
        processSensorData(parsed.address, parsed.args);
    }

    displayDataRates();
});

oscServer.on('listening', () => {
    const address = oscServer.address();
    console.log(`✅ OSC listener ready on ${address.address}:${address.port}`);
});

oscServer.on('error', (err) => {
    console.error('💥 OSC Server Error:', err);
    oscServer.close();
});

// Start servers
oscServer.bind(5001);

httpServer.listen(8080, '0.0.0.0', () => {
    console.log('✅ WebSocket server ready on ws://0.0.0.0:8080');
    console.log('📱 Phone clients can connect using your computer IP:8080');
    console.log('💻 Local clients can connect to ws://localhost:8080');
    console.log('🎯 All devices on your network can connect!');
    lastRateUpdate = Date.now();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down servers...');
    console.log(`📊 Final Stats:`);
    console.log(`   Total OSC messages: ${messageCount}`);
    console.log(`   Connected clients: ${connectedClients}`);

    wss.close();
    httpServer.close();
    oscServer.close();
    process.exit(0);
});

console.log('🎪 Enhanced Muse OSC WebSocket Server Features:');
console.log('   ✅ Real-time OSC parsing and WebSocket streaming');
console.log('   ✅ Multi-client support for web visualizations');
console.log('   ✅ Automatic data rate monitoring and broadcasting');
console.log('   ✅ All sensor types: EEG, Accelerometer, Gyroscope, PPG');
console.log('   ✅ Connect your demo at ws://localhost:8080');
console.log('   ✅ Press Ctrl+C to stop');
console.log('═'.repeat(80));
