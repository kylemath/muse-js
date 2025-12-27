# USB/UART Exploration for Athena

## Physical Port Investigation

### 1. **Visual Inspection**
- [ ] Remove any rubber covers or caps on the device
- [ ] Look for small circular ports (USB-C, micro-USB)
- [ ] Check for exposed metal contacts or test points
- [ ] Look for tiny holes that might be UART pins

### 2. **Common Muse Debug Interfaces**
Based on other Muse devices:
- **USB-C port** (if present) - might expose debug/serial interface
- **Charging contacts** - sometimes multiplex data + power
- **Hidden test points** - small metal pads on PCB

### 3. **Testing USB Connection**
If USB port found:

```bash
# On macOS, check what appears when device connected
system_profiler SPUSBDataType | grep -i muse

# Check for serial devices
ls -la /dev/tty.* | grep -i usb

# Try screen to connect to serial
screen /dev/tty.usbserial-XXXX 115200
```

### 4. **UART Pin Detection**
If test points found:
- **VCC** (3.3V) - power pin
- **GND** - ground pin  
- **TX** - transmit data from device
- **RX** - receive data to device

Use multimeter to identify:
- GND = 0V
- VCC = 3.3V or 5V
- TX/RX = varying voltage (data signals)

### 5. **Connection Setup**
If UART found, use USB-to-Serial adapter:
- Connect GND to GND
- Connect TX (device) to RX (adapter)
- Connect RX (device) to TX (adapter)
- **DO NOT** connect VCC unless needed

Common baud rates to try: 9600, 38400, 57600, 115200

## Expected Results

### Bootloader Mode
```
Muse Bootloader v3.1.11
Device: Athena_RevE
Status: Ready
>
```

### Application Mode (Post-Update)
```
Muse OS v4.x.x
Device: MuseS-C153
Sensors: EEG(4) PPG(3) IMU(1)
BLE: Active
>
```

### Debug Output During BLE Session
```
BLE: Connection from XX:XX:XX:XX:XX:XX
APP: Starting EEG stream
EEG: Channel 0 -> [1234, 5678, 9012...]
EEG: Channel 1 -> [2345, 6789, 0123...]
PPG: Ambient -> [45678, 56789...]
```

## Next Steps if USB/UART Works

1. **Capture boot sequence** during firmware update
2. **Monitor debug output** during official app connection
3. **Identify data protocols** used internally
4. **Potentially send commands** directly via UART
5. **Bypass BLE entirely** for data access

This could be **much simpler** than BLE MITM! 