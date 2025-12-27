const OSC = require('osc-js');

console.log('🧪 Testing OSC communication...');

// Create OSC instance for sending
const oscSender = new OSC({
    plugin: new OSC.DatagramPlugin({ type: 'udp4', send: { host: '127.0.0.1', port: 5001 } }),
});

oscSender.open();

let testCount = 0;

function sendTestMessage() {
    testCount++;

    // Send different types of test messages
    const messages = [
        { address: '/muse/test', args: ['Hello', 'World', testCount] },
        { address: '/muse/eeg', args: [123.456, -45.123, 67.89, -12.345] },
        { address: '/muse/acc', args: [0.1, 0.2, 0.98] },
        { address: '/muse/gyro', args: [15.5, -8.2, 3.7] },
        { address: '/muse/batt', args: [85.5] },
    ];

    const message = messages[(testCount - 1) % messages.length];

    console.log(`📤 Sending test message #${testCount}: ${message.address}`);
    oscSender.send(message);
}

oscSender.on('open', () => {
    console.log('✅ OSC sender ready');
    console.log('🚀 Sending test messages every 2 seconds...\n');

    // Send first message immediately
    sendTestMessage();

    // Then send one every 2 seconds
    const interval = setInterval(sendTestMessage, 2000);

    // Stop after 10 messages
    setTimeout(() => {
        console.log('\n🏁 Test complete - stopping sender');
        clearInterval(interval);
        oscSender.close();
        process.exit(0);
    }, 20000);
});

oscSender.on('error', (error) => {
    console.error('❌ OSC Sender Error:', error);
});

console.log('Press Ctrl+C to stop early...');
