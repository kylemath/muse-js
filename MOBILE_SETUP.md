# 📱 Mobile Muse Visualization Setup Guide

Run your Muse brain visualization entirely on mobile devices - no computer needed!

## 🎯 Deployment Options

### Option 1: Single Phone (All-in-One) 
**Easiest setup - everything on one device:**
- Phone runs: Muse app + Server + Visualization
- Access: Same phone browser (`localhost:4445`)

### Option 2: Two Phones
**Phone A (Server) + Phone B (Display):**
- Phone A: Muse app + Server
- Phone B: Connect to Phone A's IP address

### Option 3: Phone + Tablet  
**Best visualization experience:**
- Phone: Muse app + Server
- Tablet: Large screen visualization

---

## 🛠️ Android Setup (Termux)

### Step 1: Install Termux
```bash
# Download from F-Droid or Google Play
# F-Droid link: https://f-droid.org/packages/com.termux/
```

### Step 2: Install Node.js
```bash
# Open Termux and run:
pkg update
pkg install nodejs
pkg install git
```

### Step 3: Setup Project
```bash
# Clone or copy your project
cd /sdcard/
mkdir muse-mobile
cd muse-mobile

# Copy these files to your phone:
# - mobile-muse-server.js
# - demo/ folder (with src/index.html and src/main.ts)
# - package.json
```

### Step 4: Install Dependencies
```bash
npm install ws
# or if you have package.json:
npm install
```

### Step 5: Run the Server
```bash
node mobile-muse-server.js
```

You should see:
```
📱 Starting Mobile Muse Visualization Server...
✅ OSC listener ready on port 5001
✅ Demo server ready on http://0.0.0.0:4445
✅ WebSocket server ready on port 8080
```

### Step 6: Configure Network
```bash
# Find your phone's IP address:
ifconfig wlan0 | grep inet
# Example output: inet addr:192.168.1.100
```

---

## 📱 iOS Setup (iSH Shell)

### Step 1: Install iSH
```bash
# Download from App Store
# Link: https://apps.apple.com/app/ish-shell/id1436902243
```

### Step 2: Install Node.js
```bash
# In iSH shell:
apk update
apk add nodejs npm
```

### Step 3: Follow similar steps as Android
```bash
# Same process as Termux but in iSH
# May have some limitations on iOS
```

---

## 🚀 Usage Instructions

### Single Phone Setup:
1. **Start the server** in Termux
2. **Open Muse app** (same phone)
3. **Configure OSC stream**:
   - IP: `127.0.0.1` (localhost) 
   - Port: `5001`
   - Prefix: `/muse`
4. **Open browser** to `http://localhost:4445`
5. **Connect WebSocket** to `ws://localhost:8080`
6. **Start streaming** in Muse app

### Two-Device Setup:
1. **Phone A** (Server phone):
   - Run the server in Termux
   - Note the IP address (e.g., 192.168.1.100)
   - Run Muse app, stream to `127.0.0.1:5001`

2. **Phone B/Tablet** (Viewer):
   - Open browser to `http://192.168.1.100:4445`
   - Connect WebSocket to `ws://192.168.1.100:8080`

---

## 📊 Features

### ✅ What Works on Mobile:
- **Real-time brain wave visualization** (all 4 EEG channels)
- **8-channel PPG/optical data** plotting  
- **Motion sensors** (accelerometer + gyroscope)
- **Touch-friendly interface** with responsive design
- **Network sharing** between devices
- **Background operation** (with proper mobile settings)

### ⚠️ Limitations:
- **Battery usage** - servers consume power
- **Network requirements** - devices must be on same WiFi
- **iOS restrictions** - more limited than Android
- **Memory usage** - large datasets may lag

---

## 🔧 Troubleshooting

### Server Won't Start:
```bash
# Check if ports are available:
netstat -ln | grep :4445
netstat -ln | grep :8080
netstat -ln | grep :5001

# Kill existing processes:
pkill -f "node mobile-muse-server"
```

### Can't Connect from Other Device:
```bash
# Check firewall/network:
ping <phone_ip_address>

# Ensure WiFi allows device-to-device communication
# Some public WiFi blocks this
```

### Browser Issues:
- **Clear browser cache** and reload
- **Try incognito/private mode**
- **Check console for errors** (F12 or similar)

### Muse App Won't Stream:
- **Check IP address** is correct
- **Ensure port 5001** is not blocked
- **Restart Muse app** if needed
- **Test with computer first** to verify setup

---

## 💡 Tips & Optimization

### Battery Life:
```bash
# Reduce logging frequency in code
# Close unnecessary apps
# Use airplane mode + WiFi only
# Connect phone to charger during use
```

### Performance:
```bash
# Limit data buffer size for low-memory devices
# Reduce chart refresh rates if laggy  
# Close other browser tabs
# Use dedicated browser for visualization
```

### Network Setup:
```bash
# Use dedicated hotspot if possible
# Ensure devices stay on same network
# Consider static IP addresses
# Test connection stability
```

---

## 📋 Quick Checklist

- [ ] Termux/iSH installed and updated
- [ ] Node.js installed (`node --version`)
- [ ] Project files copied to phone  
- [ ] Dependencies installed (`npm install`)
- [ ] Server starts without errors
- [ ] Can access demo page in browser
- [ ] Muse app configured for OSC streaming
- [ ] WebSocket connects successfully
- [ ] Data streams and charts update
- [ ] Works across multiple devices (if needed)

---

## 🆘 Support

If you encounter issues:

1. **Check the console logs** in both Termux and browser
2. **Verify network connectivity** between devices
3. **Test each component individually** (OSC, WebSocket, HTTP)
4. **Try the computer version first** to validate your Muse setup
5. **Check Termux permissions** for network access

**Your brain visualization should now be running entirely on mobile devices! 🧠📱✨** 