const OSC = require('osc-js');

console.log('🎵 Starting OSC Sniffer for Muse data...');
console.log('📡 Listening on port 5001 for /muse/* messages\n');

// Create OSC instance with UDP receiver
const osc = new OSC({ plugin: new OSC.DatagramPlugin({ type: 'udp4', recv: { port: 5001 } }) });

// Open the connection
osc.open();

// Track message count and timestamps
let messageCount = 0;
const startTime = Date.now();

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

// Function to format numeric values for better readability
function formatValue(value) {
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return value.toString();
        } else {
            return value.toFixed(6);
        }
    }
    return value;
}

// Function to parse and display OSC message
function parseOSCMessage(message) {
    messageCount++;
    const timestamp = getTimestamp();
    const uptime = ((Date.now() - startTime) / 1000).toFixed(3);

    console.log(`\n┌─ Message #${messageCount} [${timestamp}] (+${uptime}s)`);
    console.log(`├─ Address: ${message.address}`);
    console.log(`├─ Types: ${message.types || 'none'}`);

    if (message.args && message.args.length > 0) {
        console.log(`├─ Arguments (${message.args.length}):`);
        message.args.forEach((arg, index) => {
            const formattedValue = formatValue(arg);
            const connector = index === message.args.length - 1 ? '└─' : '├─';
            console.log(`│  ${connector} [${index}]: ${formattedValue}`);
        });
    } else {
        console.log(`├─ Arguments: none`);
    }

    // Special parsing for known Muse message types
    if (message.address.startsWith('/muse')) {
        console.log(`├─ Muse Data Type: ${message.address.replace('/muse/', '')}`);

        // Parse common Muse data formats
        if (message.address.includes('eeg')) {
            console.log(
                `│  └─ EEG Channels: ${message.args ? message.args.map((v) => formatValue(v)).join(', ') : 'none'}`,
            );
        } else if (message.address.includes('acc')) {
            if (message.args && message.args.length >= 3) {
                console.log(
                    `│  └─ Accelerometer [X,Y,Z]: [${formatValue(message.args[0])}, ${formatValue(
                        message.args[1],
                    )}, ${formatValue(message.args[2])}]`,
                );
            }
        } else if (message.address.includes('gyro')) {
            if (message.args && message.args.length >= 3) {
                console.log(
                    `│  └─ Gyroscope [X,Y,Z]: [${formatValue(message.args[0])}, ${formatValue(
                        message.args[1],
                    )}, ${formatValue(message.args[2])}]`,
                );
            }
        } else if (message.address.includes('ppg')) {
            console.log(
                `│  └─ PPG Values: ${message.args ? message.args.map((v) => formatValue(v)).join(', ') : 'none'}`,
            );
        } else if (message.address.includes('batt')) {
            console.log(`│  └─ Battery: ${message.args ? formatValue(message.args[0]) + '%' : 'unknown'}`);
        }
    }

    console.log(`└─────────────────────────────────────────────────────────────`);
}

// Listen for OSC messages
osc.on('*', (message) => {
    try {
        parseOSCMessage(message);
    } catch (error) {
        console.error('Error parsing OSC message:', error);
        console.log('Raw message:', message);
    }
});

// Listen for connection events
osc.on('open', () => {
    console.log('✅ OSC connection opened successfully');
    console.log('⏳ Waiting for messages...\n');
});

osc.on('close', () => {
    console.log('\n❌ OSC connection closed');
});

osc.on('error', (error) => {
    console.error('\n💥 OSC Error:', error);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down OSC sniffer...');
    console.log(`📊 Total messages received: ${messageCount}`);
    osc.close();
    process.exit(0);
});

// Display help information
console.log('💡 Tips:');
console.log('   - Press Ctrl+C to stop the sniffer');
console.log('   - Configure your Muse app to send to port 5001 (not 5000)');
console.log('   - Try clicking "Send Test Message" in your Muse app');
console.log('   - All /muse/* messages will be captured and parsed');
console.log('═'.repeat(60));
