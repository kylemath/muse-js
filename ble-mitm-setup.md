# BLE MITM Setup Guide

## Hardware Requirements

### Option A: nRF52 Development Kit (~$50)
- **Nordic nRF52840 DK** or **nRF52833 DK**
- Acts as BLE sniffer
- Captures all packets between app and Athena
- **Purchase**: Adafruit, Mouser, or Nordic directly

### Option B: Software-Only (Free)
- **macOS built-in tools**
- **PacketLogger** (Xcode developer tools)
- **Bluetooth Explorer**

## Setup Instructions

### Method 1: nRF52 Hardware Sniffer

1. **Install Nordic Tools**
```bash
# Download from Nordic Semiconductor:
# - nRF Connect for Desktop
# - Bluetooth Low Energy app
# - Wireshark nRF Sniffer plugin
```

2. **Flash Sniffer Firmware**
```bash
# Flash the sniffer firmware to nRF52
nrfjprog --program sniffer_nrf52840_4.1.1.hex --chiperase
nrfjprog --reset
```

3. **Start Packet Capture**
```bash
# In Wireshark with nRF plugin:
# 1. Select nRF Sniffer interface
# 2. Start capture
# 3. Filter for Athena MAC: 00:55:da:bb:c1:53
```

### Method 2: macOS PacketLogger

1. **Enable Developer Mode**
```bash
# Install Xcode or Xcode Command Line Tools
xcode-select --install

# Open Additional Tools for Xcode
# Launch PacketLogger app
```

2. **Start BLE Capture**
- Launch PacketLogger
- Select "Bluetooth Low Energy"
- Click "Start"
- Filter for device: MuseS-C153

### Method 3: Bluetooth Explorer

1. **Access Hidden Bluetooth Tools**
- Hold **Option** key
- Click **Bluetooth menu** in menu bar
- Select "Open Bluetooth Explorer"

2. **Enable HCI Logging**
- Go to Utilities → HCI Controller Inspector
- Enable "HCI Packet Logging"
- Logs save to: `/var/tmp/bluetooth/`

## Capture Strategy

### Phase 1: Baseline Capture
1. **Start packet capture**
2. **Power on Athena** (capture advertising)
3. **Connect official app** (capture handshake)
4. **Start recording** (capture data flow)
5. **Stop recording** (capture disconnection)

### Phase 2: Data Analysis
Look for these packet types:

#### Connection Handshake
```
CONNECT_REQ: App → Athena
CONNECT_RSP: Athena → App
```

#### Authentication (if present)
```
ATT_WRITE: App → Control Char (273e0001)
ATT_RESPONSE: Athena → App (success/failure)
```

#### Data Streaming
```
ATT_NOTIFICATION: Athena → App (273e0013/273e0014)
Raw data: [XX, XX, XX, XX, XX, XX...]
```

### Phase 3: Protocol Reverse Engineering

#### Identify Data Patterns
- **EEG samples**: Look for 12-bit values, ~256Hz frequency
- **PPG samples**: Look for 24-bit values, ~64Hz frequency  
- **Packet structure**: Headers, sequence numbers, checksums

#### Extract Commands
- **Start command**: What triggers data flow?
- **Stop command**: How does app halt streaming?
- **Configuration**: How are sensors enabled/disabled?

## Expected Discoveries

### Authentication Sequence
```
App → Athena: [04, 'a', 'u', 't', 'h', 0x12, 0x34, 0x56, 0x78, 10]
Athena → App: {"rc": 0, "token": "abc123"}
```

### Data Stream Format
```
Athena → App: [seq_hi, seq_lo, ch0_data..., ch1_data..., checksum]
Channel 0: [sample1_hi, sample1_lo, sample2_hi, sample2_lo...]
```

### Configuration Commands
```
Enable EEG: [04, 'p', '2', '1', 10]  # We know this works
Enable PPG: [04, 'p', '5', '0', 10]  # This fails - why?
Auth PPG:   [04, 'a', 'p', 'p', 'g', auth_token, 10]  # Hypothesis
```

## Implementation Plan

Once packets are captured and analyzed:

1. **Replicate authentication** in muse-js
2. **Send discovered commands** via control characteristic
3. **Parse data packets** using discovered format
4. **Implement in enhanced MuseClient** class

## Tools for Analysis

```bash
# Wireshark filters for BLE
bluetooth.src == 00:55:da:bb:c1:53
btatt.opcode == 0x1b  # ATT_NOTIFICATION

# Extract packet data
tshark -r capture.pcapng -Y "btatt.handle == 0x0013" -T fields -e btatt.value

# Analyze patterns
python analyze_packets.py capture.pcapng
```

This approach **captures everything** the official app does and lets us **replay it exactly**! 