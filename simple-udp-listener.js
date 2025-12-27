const dgram = require('dgram');

console.log('🔍 Starting Simple UDP Listener for debugging...');
console.log('📡 Listening on port 5001 for ANY UDP messages\n');

// Create UDP server
const server = dgram.createSocket('udp4');

let messageCount = 0;

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

// Function to format buffer data
function formatBuffer(buffer) {
    const hex = buffer.toString('hex');
    const ascii = buffer.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
    return { hex, ascii, length: buffer.length };
}

server.on('message', (msg, rinfo) => {
    messageCount++;
    const timestamp = getTimestamp();

    console.log(`\n┌─ UDP Message #${messageCount} [${timestamp}]`);
    console.log(`├─ From: ${rinfo.address}:${rinfo.port}`);
    console.log(`├─ Size: ${rinfo.size} bytes`);

    const formatted = formatBuffer(msg);
    console.log(`├─ Raw Data (hex): ${formatted.hex}`);
    console.log(`├─ Raw Data (ascii): "${formatted.ascii}"`);

    // Try to detect if it looks like OSC data
    const msgString = msg.toString();
    if (msgString.includes('/muse') || msgString.includes('/')) {
        console.log(`├─ 🎯 Looks like OSC data!`);
        const matches = msgString.match(/\/[^\x00]*/g);
        const paths = matches ? matches.join(', ') : 'unknown paths';
        console.log(`│  └─ Contains: ${paths}`);
    }

    console.log(`└─────────────────────────────────────────────────────────────`);
});

server.on('listening', () => {
    const address = server.address();
    console.log(`✅ UDP server listening on ${address.address}:${address.port}`);
    console.log('⏳ Waiting for messages...\n');
});

server.on('error', (err) => {
    console.error('💥 Server Error:', err);
    server.close();
});

// Bind to port 5001
server.bind(5001);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down UDP listener...');
    console.log(`📊 Total messages received: ${messageCount}`);
    server.close();
    process.exit(0);
});

console.log('💡 Tips:');
console.log('   - This listener will capture ANY UDP traffic on port 5001');
console.log('   - Configure your Muse app to send to: 192.168.1.65:5001');
console.log('   - Press Ctrl+C to stop');
console.log('═'.repeat(60));
