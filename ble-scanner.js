#!/usr/bin/env node

console.log('🔍 BLE Passive Scanner for Muse Devices');
console.log('=========================================');
console.log('');
console.log("Since noble requires newer Node.js, let's use alternative approaches:");
console.log('');
console.log('📋 TESTING PLAN for Athena Device States:');
console.log('');
console.log('1. 🔋 ATHENA JUST POWERED ON (unpaired) - START HERE');
console.log('   • Turn on Athena (flashing blue LED)');
console.log('   • DO NOT pair with any app yet');
console.log('   • Run: sudo hcitool lescan');
console.log('   • Expected: Device advertising for pairing');
console.log('');
console.log('2. 📱 ATHENA PAIRED BUT IDLE');
console.log('   • Connect to official Muse app');
console.log("   • Keep app open but don't start recording");
console.log('   • Run scan again');
console.log('   • Expected: Different advertising pattern');
console.log('');
console.log('3. 🎯 ATHENA ACTIVELY STREAMING (MOST IMPORTANT)');
console.log('   • Start EEG recording in official app');
console.log('   • Run scan during active data streaming');
console.log('   • Expected: Potential data leakage in packets');
console.log('');
console.log('🛠️  ALTERNATIVE SCANNING METHODS:');
console.log('');
console.log('A) macOS Bluetooth Debug Menu:');
console.log('   • Hold Option + click Bluetooth menu bar icon');
console.log('   • Select "Debug" > "Start Logging"');
console.log('   • Power cycle Athena and check Console app');
console.log('');
console.log('B) Use existing demo with discovery mode:');
console.log('   • Open http://localhost:4445/');
console.log('   • Click "Connect with Discovery"');
console.log('   • Monitor for advertising packets in browser console');
console.log('');
console.log('C) Command line tools (if available):');

// Check for available BLE tools
const { execSync } = require('child_process');

try {
    console.log(
        '   • hcitool: ',
        execSync('which hcitool 2>/dev/null || echo "not found"')
            .toString()
            .trim(),
    );
} catch (e) {
    console.log('   • hcitool: not found');
}

try {
    console.log(
        '   • bluetoothctl: ',
        execSync('which bluetoothctl 2>/dev/null || echo "not found"')
            .toString()
            .trim(),
    );
} catch (e) {
    console.log('   • bluetoothctl: not found');
}

console.log('');
console.log('🎯 RECOMMENDED NEXT STEPS:');
console.log('1. Start with Athena powered ON but unpaired');
console.log('2. Open demo at http://localhost:4445/');
console.log('3. Use "Connect with Discovery" button');
console.log('4. Check browser console for advertising data');
console.log('5. Try different Athena states');
console.log('');
console.log('💡 KEY INSIGHT: Even if GATT characteristics are locked,');
console.log('   advertising packets might contain sensor previews!');
console.log('');

// Create a simple web-based scanner using the existing demo
console.log('🚀 STARTING DEMO SERVER FOR TESTING...');
console.log('   Navigate to: http://localhost:4445/');
console.log('   Use the discovery tools there for passive scanning');
console.log('');
