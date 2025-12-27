const dgram = require('dgram');

console.log('🧠 Starting Real-Time Muse OSC Parser...');
console.log('📡 Listening on port 5001 for decoded sensor data\n');

// Create UDP server
const server = dgram.createSocket('udp4');

let messageCount = 0;
let lastTimestamp = Date.now();

// Data rate tracking
let dataRates = {
    eeg: 0,
    acc: 0,
    gyro: 0,
    optics: 0,
    drlref: 0,
};
let lastRateUpdate = Date.now();

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
    // Skip to next 4-byte boundary
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
    // Skip to next 4-byte boundary
    const padded = Math.ceil((tag.length + 1) / 4) * 4;
    return { value: tag, nextOffset: offset + padded };
}

// Function to parse complete OSC message
function parseOSCMessage(buffer) {
    try {
        // Parse address
        const address = parseOSCString(buffer, 0);

        // Parse type tag
        const typeTag = parseOSCTypeTag(buffer, address.nextOffset);

        // Parse arguments based on type tag
        const args = [];
        let offset = typeTag.nextOffset;

        // Skip comma in type tag and parse each type
        for (let i = 1; i < typeTag.value.length; i++) {
            const type = typeTag.value[i];
            if (type === 'f') {
                // 32-bit float
                if (offset + 4 <= buffer.length) {
                    args.push(parseFloat32BE(buffer, offset));
                    offset += 4;
                }
            }
            // Add other types if needed (i, s, etc.)
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

// Function to format sensor values for display
function formatSensorData(address, args) {
    const timestamp = getTimestamp();
    const timeDiff = Date.now() - lastTimestamp;
    lastTimestamp = Date.now();

    switch (true) {
        case address.includes('/eeg'):
            if (args.length >= 4) {
                dataRates.eeg++;
                return `🧠 EEG [${timestamp}] +${timeDiff}ms
    TP9: ${args[0].toFixed(2)}µV | AF7: ${args[1].toFixed(2)}µV | AF8: ${args[2].toFixed(
                    2,
                )}µV | TP10: ${args[3].toFixed(2)}µV`;
            }
            break;

        case address.includes('/acc'):
            if (args.length >= 3) {
                dataRates.acc++;
                const magnitude = Math.sqrt(args[0] * args[0] + args[1] * args[1] + args[2] * args[2]);
                return `📱 Accelerometer [${timestamp}] +${timeDiff}ms
    X: ${args[0].toFixed(3)}g | Y: ${args[1].toFixed(3)}g | Z: ${args[2].toFixed(3)}g | Mag: ${magnitude.toFixed(3)}g`;
            }
            break;

        case address.includes('/gyro'):
            if (args.length >= 3) {
                dataRates.gyro++;
                return `🌀 Gyroscope [${timestamp}] +${timeDiff}ms
    X: ${args[0].toFixed(2)}°/s | Y: ${args[1].toFixed(2)}°/s | Z: ${args[2].toFixed(2)}°/s`;
            }
            break;

        case address.includes('/optics'):
            dataRates.optics++;
            const channels = args
                .slice(0, 8)
                .map((val, i) => `Ch${i + 1}: ${val.toFixed(1)}`)
                .join(' | ');
            return `💡 PPG/Optics [${timestamp}] +${timeDiff}ms
    ${channels}`;

        case address.includes('/ppg'):
            dataRates.optics++; // Count PPG with optics
            // Handle different PPG formats - filter out NaN values
            const validPPG = args.filter((val) => !isNaN(val));
            if (validPPG.length > 0) {
                const ppgChannels = validPPG.map((val, i) => `PPG${i + 1}: ${val.toFixed(1)}`).join(' | ');
                return `💓 PPG [${timestamp}] +${timeDiff}ms
    ${ppgChannels} | Format: [${args.map((v) => (isNaN(v) ? 'NaN' : v.toFixed(1))).join(', ')}]`;
            } else {
                return `💓 PPG [${timestamp}] +${timeDiff}ms - All NaN values`;
            }

        case address.includes('/drlref'):
            if (args.length >= 2) {
                dataRates.drlref++;
                return `🔗 DRL Reference [${timestamp}] +${timeDiff}ms
    DRL: ${args[0].toFixed(1)} | REF: ${args[1].toFixed(1)}`;
            }
            break;

        default:
            return `❓ Unknown [${timestamp}]: ${address} | Args: ${args.map((a) => a.toFixed(3)).join(', ')}`;
    }

    return null;
}

// Function to display data rates
function displayDataRates() {
    const now = Date.now();
    const elapsed = (now - lastRateUpdate) / 1000;

    if (elapsed >= 5.0) {
        // Update every 5 seconds
        console.log('\n📊 ═══════ DATA RATES (messages/sec) ═══════');
        console.log(`🧠 EEG: ${(dataRates.eeg / elapsed).toFixed(1)} Hz`);
        console.log(`📱 Accelerometer: ${(dataRates.acc / elapsed).toFixed(1)} Hz`);
        console.log(`🌀 Gyroscope: ${(dataRates.gyro / elapsed).toFixed(1)} Hz`);
        console.log(`💡 PPG/Optics: ${(dataRates.optics / elapsed).toFixed(1)} Hz`);
        console.log(`🔗 DRL Reference: ${(dataRates.drlref / elapsed).toFixed(1)} Hz`);
        console.log(`📦 Total Messages: ${messageCount}`);
        console.log('═══════════════════════════════════════════\n');

        // Reset counters
        dataRates = { eeg: 0, acc: 0, gyro: 0, optics: 0, drlref: 0 };
        lastRateUpdate = now;
    }
}

server.on('message', (msg, rinfo) => {
    messageCount++;

    // Parse the OSC message
    const parsed = parseOSCMessage(msg);

    if (parsed) {
        const formatted = formatSensorData(parsed.address, parsed.args);
        if (formatted) {
            console.log(formatted);
        }
    } else {
        // Fallback for unparseable messages
        console.log(`❌ Parse Error [${getTimestamp()}]: ${msg.toString('hex').substring(0, 40)}...`);
    }

    // Update data rates periodically
    displayDataRates();
});

server.on('listening', () => {
    const address = server.address();
    console.log(`✅ Real-time parser listening on ${address.address}:${address.port}`);
    console.log('🎯 Decoding OSC messages into sensor values...\n');
    lastRateUpdate = Date.now();
});

server.on('error', (err) => {
    console.error('💥 Parser Error:', err);
    server.close();
});

// Bind to port 5001
server.bind(5001);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down real-time parser...');
    console.log(`📊 Final Stats:`);
    console.log(`   Total messages processed: ${messageCount}`);
    console.log(`   Session duration: ${((Date.now() - lastRateUpdate) / 1000).toFixed(1)}s`);
    server.close();
    process.exit(0);
});

console.log('💡 Features:');
console.log('   ✅ Real-time OSC decoding');
console.log('   ✅ EEG data in µV (microvolts)');
console.log('   ✅ Accelerometer in g-force');
console.log('   ✅ Gyroscope in degrees/second');
console.log('   ✅ PPG/Optics multi-channel data');
console.log('   ✅ Data rate monitoring every 5 seconds');
console.log('   ✅ Press Ctrl+C to stop');
console.log('═'.repeat(60));
