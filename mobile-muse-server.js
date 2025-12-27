#!/usr/bin/env node

// 📱 Mobile Muse Visualization Server
// Combined OSC + WebSocket + HTTP server for mobile deployment
// Run this on your phone with Termux + Node.js

const dgram = require('dgram');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('📱 Starting Mobile Muse Visualization Server...');
console.log('🎯 All-in-one: OSC → WebSocket + HTTP Demo Server');
console.log('🚀 Perfect for running on a phone with Termux!\n');

// Configuration
const OSC_PORT = 5001;
const HTTP_PORT = 4445;
const WEBSOCKET_PORT = 8080;

// Create servers
const oscServer = dgram.createSocket('udp4');
const httpServer = http.createServer();
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Server state
let messageCount = 0;
let lastTimestamp = Date.now();
let connectedClients = 0;
let sessionStartTime = Date.now();

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

// MIME types for static file serving
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
};

// Serve static files
function serveStaticFile(req, res) {
    let filePath = req.url === '/' ? '/demo/src/index.html' : req.url;

    // Security: prevent directory traversal
    filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');

    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(fullPath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
        } else {
            // Inject mobile-optimized JavaScript if serving main.js
            if (filePath.includes('main.js')) {
                let jsContent = data.toString();
                // Replace localhost with dynamic IP detection for mobile
                jsContent = jsContent.replace('ws://localhost:8080', `ws://${getLocalIP()}:${WEBSOCKET_PORT}`);
                data = Buffer.from(jsContent);
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
            });
            res.end(data);
        }
    });
}

// Get local IP address
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// OSC parsing functions (same as before)
function parseFloat32BE(buffer, offset) {
    return buffer.readFloatBE(offset);
}

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

// Broadcast data to all WebSocket clients
function broadcastData(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Process sensor data (same logic as before but optimized for mobile)
function processSensorData(address, args) {
    const timestamp = Date.now();
    const relativeTimestamp = timestamp - sessionStartTime;
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
                channels: args.slice(0, 8),
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
                    channels: args.slice(0, 8),
                    validChannels: validPPG.slice(0, 8),
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
    }

    // Broadcast to all connected clients
    if (data && connectedClients > 0) {
        broadcastData(data);
    }

    return data;
}

// Display data rates
function displayDataRates() {
    const now = Date.now();
    const elapsed = (now - lastRateUpdate) / 1000;

    if (elapsed >= 5.0) {
        // Update every 5 seconds (less frequent for mobile)
        const rates = {
            eeg: (dataRates.eeg / elapsed).toFixed(1),
            acc: (dataRates.acc / elapsed).toFixed(1),
            gyro: (dataRates.gyro / elapsed).toFixed(1),
            ppg: (dataRates.ppg / elapsed).toFixed(1),
            optics: (dataRates.optics / elapsed).toFixed(1),
            drlref: (dataRates.drlref / elapsed).toFixed(1),
        };

        console.log('\n📊 ═══ MOBILE DATA RATES ═══');
        console.log(
            `🧠 EEG: ${rates.eeg}Hz | 📱 Motion: ${(parseFloat(rates.acc) + parseFloat(rates.gyro)).toFixed(1)}Hz`,
        );
        console.log(`💓 PPG: ${rates.optics}Hz | 🔗 Clients: ${connectedClients}`);
        console.log('═'.repeat(30));

        // Broadcast data rates to clients
        if (connectedClients > 0) {
            broadcastData({
                type: 'dataRates',
                timestamp: now - sessionStartTime,
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

// WebSocket connection handling
wss.on('connection', (ws) => {
    connectedClients++;
    console.log(`🔗 New client connected! Total: ${connectedClients}`);

    // Reset session start time for first client
    if (connectedClients === 1) {
        sessionStartTime = Date.now();
        console.log(`📅 New session started at ${new Date(sessionStartTime).toLocaleTimeString()}`);
    }

    // Send welcome message and current data rates
    ws.send(
        JSON.stringify({
            type: 'welcome',
            message: 'Connected to Mobile Muse Stream',
            dataRates: dataRates,
            timestamp: Date.now() - sessionStartTime,
            sessionStartTime: sessionStartTime,
            serverInfo: {
                type: 'mobile',
                ip: getLocalIP(),
                ports: { http: HTTP_PORT, websocket: WEBSOCKET_PORT, osc: OSC_PORT },
            },
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
        console.log(`📴 Client disconnected. Remaining: ${connectedClients}`);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// HTTP server for serving demo files
httpServer.on('request', serveStaticFile);

// OSC message handling
oscServer.on('message', (msg, rinfo) => {
    messageCount++;

    const parsed = parseOSCMessage(msg);

    if (parsed) {
        processSensorData(parsed.address, parsed.args);
    }

    displayDataRates();
});

// Start all servers
oscServer.bind(OSC_PORT, () => {
    console.log(`✅ OSC listener ready on port ${OSC_PORT}`);
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`✅ Demo server ready on http://0.0.0.0:${HTTP_PORT}`);
    console.log(`📱 Local access: http://localhost:${HTTP_PORT}`);
    console.log(`🌐 Network access: http://${localIP}:${HTTP_PORT}`);
});

console.log(`✅ WebSocket server ready on port ${WEBSOCKET_PORT}`);
console.log(`📱 Mobile-optimized for phone deployment!`);

// Mobile-specific startup instructions
console.log('\n🚀 MOBILE SETUP INSTRUCTIONS:');
console.log('1. 📱 Install Termux on Android');
console.log('2. 🛠️  Run: pkg install nodejs');
console.log('3. 📁 Copy this script to phone');
console.log('4. ▶️  Run: node mobile-muse-server.js');
console.log('5. 🌐 Open browser to localhost:4445');
console.log('6. 🎯 Configure Muse app to stream to localhost:5001');
console.log('═'.repeat(50));

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Mobile Muse Server...');
    console.log(`📊 Final Stats: ${messageCount} messages, ${connectedClients} clients`);

    wss.close();
    httpServer.close();
    oscServer.close();
    process.exit(0);
});
