var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { BehaviorSubject, fromEvent, merge, Subject } from 'rxjs';
import { filter, first, map, share, take } from 'rxjs/operators';
import { ATHENA_DATA2_CHARACTERISTIC, ATHENA_DATA_CHARACTERISTIC, ATHENA_DEFAULT_PRESET, ATHENA_EEG_SAMPLE_RATE, ATHENA_EEG_SCALE, ATHENA_OPTICS_SAMPLE_RATE, athenaEegToMicrovolts, parseAthenaNotification, unpackLE, } from './lib/athena-parse';
import { decodeEEGSamples, decodePPGSamples, parseAccelerometer, parseControl, parseGyroscope, parseTelemetry, } from './lib/muse-parse';
import { decodeResponse, encodeCommand, observableCharacteristic } from './lib/muse-utils';
export { zipSamples } from './lib/zip-samples';
export { zipSamplesPpg } from './lib/zip-samplesPpg';
export { ATHENA_DATA_CHARACTERISTIC, ATHENA_DATA2_CHARACTERISTIC, ATHENA_DEFAULT_PRESET, ATHENA_EEG_SCALE, athenaEegToMicrovolts, parseAthenaNotification, unpackLE, };
export var MUSE_SERVICE = 0xfe8d;
var CONTROL_CHARACTERISTIC = '273e0001-4c4d-454d-96be-f03bac821358';
var TELEMETRY_CHARACTERISTIC = '273e000b-4c4d-454d-96be-f03bac821358';
var GYROSCOPE_CHARACTERISTIC = '273e0009-4c4d-454d-96be-f03bac821358';
var ACCELEROMETER_CHARACTERISTIC = '273e000a-4c4d-454d-96be-f03bac821358';
var PPG_CHARACTERISTICS = [
    '273e000f-4c4d-454d-96be-f03bac821358',
    '273e0010-4c4d-454d-96be-f03bac821358',
    '273e0011-4c4d-454d-96be-f03bac821358',
];
export var PPG_FREQUENCY = 64;
export var PPG_SAMPLES_PER_READING = 6;
var EEG_CHARACTERISTICS = [
    '273e0003-4c4d-454d-96be-f03bac821358',
    '273e0004-4c4d-454d-96be-f03bac821358',
    '273e0005-4c4d-454d-96be-f03bac821358',
    '273e0006-4c4d-454d-96be-f03bac821358',
    '273e0007-4c4d-454d-96be-f03bac821358',
];
export var EEG_FREQUENCY = 256;
export var EEG_SAMPLES_PER_READING = 12;
// These names match the characteristics defined in PPG_CHARACTERISTICS above
export var ppgChannelNames = ['ambient', 'infrared', 'red'];
// These names match the characteristics defined in EEG_CHARACTERISTICS above
export var channelNames = ['TP9', 'AF7', 'AF8', 'TP10', 'AUX'];
var MuseClient = /** @class */ (function () {
    function MuseClient() {
        this.enableAux = false;
        this.enablePpg = false;
        this.isAthena = false;
        this.preset = null;
        this.deviceName = '';
        this.connectionStatus = new BehaviorSubject(false);
        this.gatt = null;
        this.lastIndex = null;
        this.lastTimestamp = null;
        this.athenaSeqTracker = new Map();
        this.athenaStartWallTime = null;
        this.athenaReceivedEEG = false;
    }
    MuseClient.prototype.connect = function (gatt) {
        return __awaiter(this, void 0, void 0, function () {
            var device, _a, service, _b, _c, discoveredUuids, chars, err_1, telemetryCharacteristic, _d, err_2, gyroscopeCharacteristic, _e, err_3, accelerometerCharacteristic, _f, err_4, ppgObservables, ppgChannelCount, _loop_1, this_1, ppgChannelIndex, eegAvailable, err_5, err_6, err_7, device, _g, _h, _j, eegObservables, channelCount, _loop_2, this_2, channelIndex;
            var _this = this;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        if (!gatt) return [3 /*break*/, 1];
                        this.gatt = gatt;
                        return [3 /*break*/, 4];
                    case 1: return [4 /*yield*/, navigator.bluetooth.requestDevice({
                            filters: [{ services: [MUSE_SERVICE] }],
                        })];
                    case 2:
                        device = _k.sent();
                        _a = this;
                        return [4 /*yield*/, device.gatt.connect()];
                    case 3:
                        _a.gatt = _k.sent();
                        _k.label = 4;
                    case 4:
                        this.deviceName = this.gatt.device.name || null;
                        return [4 /*yield*/, this.gatt.getPrimaryService(MUSE_SERVICE)];
                    case 5:
                        service = _k.sent();
                        fromEvent(this.gatt.device, 'gattserverdisconnected')
                            .pipe(first())
                            .subscribe(function () {
                            _this.gatt = null;
                            _this.connectionStatus.next(false);
                        });
                        // Control
                        _b = this;
                        return [4 /*yield*/, service.getCharacteristic(CONTROL_CHARACTERISTIC)];
                    case 6:
                        // Control
                        _b.controlChar = _k.sent();
                        _c = this;
                        return [4 /*yield*/, observableCharacteristic(this.controlChar)];
                    case 7:
                        _c.rawControlData = (_k.sent()).pipe(map(function (data) { return decodeResponse(new Uint8Array(data.buffer)); }), share());
                        this.controlResponses = parseControl(this.rawControlData);
                        this.eventMarkers = new Subject();
                        this.isAthena = false;
                        this.athenaSeqTracker.clear();
                        this.athenaStartWallTime = null;
                        this.athenaReceivedEEG = false;
                        discoveredUuids = [];
                        if (!(typeof service.getCharacteristics === 'function')) return [3 /*break*/, 11];
                        _k.label = 8;
                    case 8:
                        _k.trys.push([8, 10, , 11]);
                        return [4 /*yield*/, service.getCharacteristics()];
                    case 9:
                        chars = _k.sent();
                        discoveredUuids = chars.map(function (c) { return c.uuid.toLowerCase(); });
                        return [3 /*break*/, 11];
                    case 10:
                        err_1 = _k.sent();
                        discoveredUuids = [];
                        return [3 /*break*/, 11];
                    case 11:
                        if (!(discoveredUuids.indexOf(ATHENA_DATA_CHARACTERISTIC) >= 0 &&
                            discoveredUuids.indexOf(EEG_CHARACTERISTICS[0]) === -1)) return [3 /*break*/, 13];
                        this.isAthena = true;
                        return [4 /*yield*/, this.setupAthenaStreams(service, discoveredUuids)];
                    case 12:
                        _k.sent();
                        this.connectionStatus.next(true);
                        return [2 /*return*/];
                    case 13:
                        _k.trys.push([13, 16, , 17]);
                        return [4 /*yield*/, service.getCharacteristic(TELEMETRY_CHARACTERISTIC)];
                    case 14:
                        telemetryCharacteristic = _k.sent();
                        _d = this;
                        return [4 /*yield*/, observableCharacteristic(telemetryCharacteristic)];
                    case 15:
                        _d.telemetryData = (_k.sent()).pipe(map(parseTelemetry));
                        return [3 /*break*/, 17];
                    case 16:
                        err_2 = _k.sent();
                        this.telemetryData = new Subject();
                        return [3 /*break*/, 17];
                    case 17:
                        _k.trys.push([17, 20, , 21]);
                        return [4 /*yield*/, service.getCharacteristic(GYROSCOPE_CHARACTERISTIC)];
                    case 18:
                        gyroscopeCharacteristic = _k.sent();
                        _e = this;
                        return [4 /*yield*/, observableCharacteristic(gyroscopeCharacteristic)];
                    case 19:
                        _e.gyroscopeData = (_k.sent()).pipe(map(parseGyroscope));
                        return [3 /*break*/, 21];
                    case 20:
                        err_3 = _k.sent();
                        this.gyroscopeData = new Subject();
                        return [3 /*break*/, 21];
                    case 21:
                        _k.trys.push([21, 24, , 25]);
                        return [4 /*yield*/, service.getCharacteristic(ACCELEROMETER_CHARACTERISTIC)];
                    case 22:
                        accelerometerCharacteristic = _k.sent();
                        _f = this;
                        return [4 /*yield*/, observableCharacteristic(accelerometerCharacteristic)];
                    case 23:
                        _f.accelerometerData = (_k.sent()).pipe(map(parseAccelerometer));
                        return [3 /*break*/, 25];
                    case 24:
                        err_4 = _k.sent();
                        this.accelerometerData = new Subject();
                        return [3 /*break*/, 25];
                    case 25:
                        if (!this.enablePpg) return [3 /*break*/, 30];
                        this.ppgCharacteristics = [];
                        ppgObservables = [];
                        ppgChannelCount = PPG_CHARACTERISTICS.length;
                        _loop_1 = function (ppgChannelIndex) {
                            var characteristicId, ppgChar, _a, _b, err_8;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        _c.trys.push([0, 3, , 4]);
                                        characteristicId = PPG_CHARACTERISTICS[ppgChannelIndex];
                                        return [4 /*yield*/, service.getCharacteristic(characteristicId)];
                                    case 1:
                                        ppgChar = _c.sent();
                                        _b = (_a = ppgObservables).push;
                                        return [4 /*yield*/, observableCharacteristic(ppgChar)];
                                    case 2:
                                        _b.apply(_a, [(_c.sent()).pipe(map(function (data) {
                                                var eventIndex = data.getUint16(0);
                                                return {
                                                    index: eventIndex,
                                                    ppgChannel: ppgChannelIndex,
                                                    samples: decodePPGSamples(new Uint8Array(data.buffer).subarray(2)),
                                                    timestamp: _this.getTimestamp(eventIndex, PPG_SAMPLES_PER_READING, PPG_FREQUENCY),
                                                };
                                            }))]);
                                        this_1.ppgCharacteristics.push(ppgChar);
                                        return [3 /*break*/, 4];
                                    case 3:
                                        err_8 = _c.sent();
                                        return [3 /*break*/, 4];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        ppgChannelIndex = 0;
                        _k.label = 26;
                    case 26:
                        if (!(ppgChannelIndex < ppgChannelCount)) return [3 /*break*/, 29];
                        return [5 /*yield**/, _loop_1(ppgChannelIndex)];
                    case 27:
                        _k.sent();
                        _k.label = 28;
                    case 28:
                        ppgChannelIndex++;
                        return [3 /*break*/, 26];
                    case 29:
                        this.ppgReadings = ppgObservables.length ? merge.apply(void 0, ppgObservables) : new Subject();
                        _k.label = 30;
                    case 30:
                        eegAvailable = true;
                        _k.label = 31;
                    case 31:
                        _k.trys.push([31, 33, , 34]);
                        return [4 /*yield*/, service.getCharacteristic(EEG_CHARACTERISTICS[0])];
                    case 32:
                        _k.sent();
                        return [3 /*break*/, 34];
                    case 33:
                        err_5 = _k.sent();
                        eegAvailable = false;
                        return [3 /*break*/, 34];
                    case 34:
                        if (!!eegAvailable) return [3 /*break*/, 56];
                        _k.label = 35;
                    case 35:
                        _k.trys.push([35, 38, , 39]);
                        return [4 /*yield*/, service.getCharacteristic(ATHENA_DATA_CHARACTERISTIC)];
                    case 36:
                        _k.sent();
                        this.isAthena = true;
                        return [4 /*yield*/, this.setupAthenaStreams(service, [ATHENA_DATA_CHARACTERISTIC])];
                    case 37:
                        _k.sent();
                        this.connectionStatus.next(true);
                        return [2 /*return*/];
                    case 38:
                        err_6 = _k.sent();
                        return [3 /*break*/, 39];
                    case 39: return [4 /*yield*/, this.sendCommand('v1')];
                    case 40:
                        _k.sent();
                        return [4 /*yield*/, this.delay(100)];
                    case 41:
                        _k.sent();
                        return [4 /*yield*/, this.sendCommand('h')];
                    case 42:
                        _k.sent();
                        return [4 /*yield*/, this.sendCommand('p21')];
                    case 43:
                        _k.sent();
                        return [4 /*yield*/, this.sendCommand('s')];
                    case 44:
                        _k.sent();
                        return [4 /*yield*/, this.sendCommand('d')];
                    case 45:
                        _k.sent();
                        return [4 /*yield*/, this.delay(500)];
                    case 46:
                        _k.sent();
                        _k.label = 47;
                    case 47:
                        _k.trys.push([47, 49, , 56]);
                        return [4 /*yield*/, service.getCharacteristic(EEG_CHARACTERISTICS[0])];
                    case 48:
                        _k.sent();
                        eegAvailable = true;
                        return [3 /*break*/, 56];
                    case 49:
                        err_7 = _k.sent();
                        if (!(this.gatt && this.gatt.device && this.gatt.device.gatt)) return [3 /*break*/, 55];
                        device = this.gatt.device;
                        if (this.gatt.connected) {
                            this.gatt.disconnect();
                        }
                        return [4 /*yield*/, this.delay(500)];
                    case 50:
                        _k.sent();
                        _g = this;
                        return [4 /*yield*/, device.gatt.connect()];
                    case 51:
                        _g.gatt = _k.sent();
                        return [4 /*yield*/, this.gatt.getPrimaryService(MUSE_SERVICE)];
                    case 52:
                        service = _k.sent();
                        _h = this;
                        return [4 /*yield*/, service.getCharacteristic(CONTROL_CHARACTERISTIC)];
                    case 53:
                        _h.controlChar = _k.sent();
                        _j = this;
                        return [4 /*yield*/, observableCharacteristic(this.controlChar)];
                    case 54:
                        _j.rawControlData = (_k.sent()).pipe(map(function (data) { return decodeResponse(new Uint8Array(data.buffer)); }), share());
                        this.controlResponses = parseControl(this.rawControlData);
                        _k.label = 55;
                    case 55: return [3 /*break*/, 56];
                    case 56:
                        // EEG
                        this.eegCharacteristics = [];
                        eegObservables = [];
                        channelCount = this.enableAux ? EEG_CHARACTERISTICS.length : 4;
                        _loop_2 = function (channelIndex) {
                            var characteristicId, eegChar, _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        characteristicId = EEG_CHARACTERISTICS[channelIndex];
                                        return [4 /*yield*/, service.getCharacteristic(characteristicId)];
                                    case 1:
                                        eegChar = _c.sent();
                                        _b = (_a = eegObservables).push;
                                        return [4 /*yield*/, observableCharacteristic(eegChar)];
                                    case 2:
                                        _b.apply(_a, [(_c.sent()).pipe(map(function (data) {
                                                var eventIndex = data.getUint16(0);
                                                return {
                                                    electrode: channelIndex,
                                                    index: eventIndex,
                                                    samples: decodeEEGSamples(new Uint8Array(data.buffer).subarray(2)),
                                                    timestamp: _this.getTimestamp(eventIndex, EEG_SAMPLES_PER_READING, EEG_FREQUENCY),
                                                };
                                            }))]);
                                        this_2.eegCharacteristics.push(eegChar);
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_2 = this;
                        channelIndex = 0;
                        _k.label = 57;
                    case 57:
                        if (!(channelIndex < channelCount)) return [3 /*break*/, 60];
                        return [5 /*yield**/, _loop_2(channelIndex)];
                    case 58:
                        _k.sent();
                        _k.label = 59;
                    case 59:
                        channelIndex++;
                        return [3 /*break*/, 57];
                    case 60:
                        this.eegReadings = merge.apply(void 0, eegObservables);
                        this.connectionStatus.next(true);
                        return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.sendCommand = function (cmd) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.controlChar.writeValue(encodeCommand(cmd))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var preset;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isAthena) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.startAthena()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                    case 2: return [4 /*yield*/, this.pause()];
                    case 3:
                        _a.sent();
                        preset = 'p21';
                        if (this.enablePpg) {
                            preset = 'p50';
                        }
                        else if (this.enableAux) {
                            preset = 'p20';
                        }
                        return [4 /*yield*/, this.controlChar.writeValue(encodeCommand(preset))];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.controlChar.writeValue(encodeCommand('s'))];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, this.resume()];
                    case 6:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.pause = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.sendCommand('h')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.resume = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isAthena) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.sendCommand('dc001')];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.delay(50)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.sendCommand('dc001')];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                    case 4: return [4 /*yield*/, this.sendCommand('d')];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.deviceInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var resultListener;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        resultListener = this.controlResponses
                            .pipe(filter(function (r) { return !!r.fw; }), take(1))
                            .toPromise();
                        return [4 /*yield*/, this.sendCommand('v1')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, resultListener];
                }
            });
        });
    };
    MuseClient.prototype.injectMarker = function (value, timestamp) {
        if (timestamp === void 0) { timestamp = new Date().getTime(); }
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.eventMarkers.next({ value: value, timestamp: timestamp })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.disconnect = function () {
        if (this.gatt) {
            this.lastIndex = null;
            this.lastTimestamp = null;
            this.athenaSeqTracker.clear();
            this.athenaStartWallTime = null;
            this.gatt.disconnect();
            this.connectionStatus.next(false);
        }
    };
    MuseClient.prototype.delay = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    MuseClient.prototype.trackAthenaSubpacket = function (tag, seqIndex, samplesPerSubpacket, sampleRate) {
        if (this.athenaStartWallTime === null) {
            this.athenaStartWallTime = new Date().getTime();
        }
        var key = "tag_" + tag;
        var last = this.athenaSeqTracker.get(key);
        var unwrappedCount = 0;
        if (last) {
            var step = (seqIndex - last.seq + 256) % 256 || 1;
            unwrappedCount = last.count + step;
        }
        this.athenaSeqTracker.set(key, { seq: seqIndex, count: unwrappedCount });
        var sampleIndex = unwrappedCount * samplesPerSubpacket;
        var timestamp = this.athenaStartWallTime + (sampleIndex * 1000) / sampleRate;
        return { unwrappedCount: unwrappedCount, timestamp: timestamp };
    };
    MuseClient.prototype.setupAthenaStreams = function (service, discoveredUuids) {
        return __awaiter(this, void 0, void 0, function () {
            var eegSubject, ppgSubject, telemetrySubject, accelSubject, gyroSubject, handleNotification, dataChar, data2Char, err_9;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        eegSubject = new Subject();
                        ppgSubject = new Subject();
                        telemetrySubject = new Subject();
                        accelSubject = new Subject();
                        gyroSubject = new Subject();
                        this.eegReadings = eegSubject.asObservable();
                        this.ppgReadings = ppgSubject.asObservable();
                        this.telemetryData = telemetrySubject.asObservable();
                        this.accelerometerData = accelSubject.asObservable();
                        this.gyroscopeData = gyroSubject.asObservable();
                        this.eegCharacteristics = [];
                        this.ppgCharacteristics = [];
                        handleNotification = function (data) {
                            var bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                            parseAthenaNotification(bytes, function (sub) {
                                if (sub.type === 'eeg') {
                                    _this.athenaReceivedEEG = true;
                                    var nSamples = sub.values[0] ? sub.values[0].length : 4;
                                    var tracked = _this.trackAthenaSubpacket(sub.tag, sub.index, nSamples, ATHENA_EEG_SAMPLE_RATE);
                                    var maxCh = _this.enableAux ? Math.min(sub.values.length, 5) : Math.min(sub.values.length, 4);
                                    for (var ch = 0; ch < maxCh; ch++) {
                                        eegSubject.next({
                                            electrode: ch,
                                            index: tracked.unwrappedCount,
                                            samples: sub.values[ch],
                                            timestamp: tracked.timestamp,
                                        });
                                    }
                                }
                                else if (sub.type === 'optics') {
                                    var nSamples = sub.values[0] ? sub.values[0].length : 3;
                                    var tracked = _this.trackAthenaSubpacket(sub.tag, sub.index, nSamples, ATHENA_OPTICS_SAMPLE_RATE);
                                    var mappedChannels = sub.values.length >= 16
                                        ? [sub.values[14], sub.values[6], sub.values[12]]
                                        : sub.values.slice(0, 3);
                                    for (var ch = 0; ch < mappedChannels.length; ch++) {
                                        if (!mappedChannels[ch]) {
                                            continue;
                                        }
                                        ppgSubject.next({
                                            index: tracked.unwrappedCount,
                                            ppgChannel: ch,
                                            samples: mappedChannels[ch],
                                            timestamp: tracked.timestamp,
                                        });
                                    }
                                }
                                else if (sub.type === 'motion') {
                                    // tslint:disable:object-literal-sort-keys
                                    accelSubject.next({
                                        sequenceId: sub.index,
                                        samples: [0, 1, 2].map(function (i) { return ({
                                            x: sub.values[0][i],
                                            y: sub.values[1][i],
                                            z: sub.values[2][i],
                                        }); }),
                                    });
                                    gyroSubject.next({
                                        sequenceId: sub.index,
                                        samples: [0, 1, 2].map(function (i) { return ({
                                            x: sub.values[3][i],
                                            y: sub.values[4][i],
                                            z: sub.values[5][i],
                                        }); }),
                                    });
                                    // tslint:enable:object-literal-sort-keys
                                }
                                else if (sub.type === 'battery') {
                                    // tslint:disable:object-literal-sort-keys
                                    telemetrySubject.next({
                                        sequenceId: sub.index,
                                        batteryLevel: sub.values[0][0],
                                        fuelGaugeVoltage: 0,
                                        temperature: 0,
                                    });
                                    // tslint:enable:object-literal-sort-keys
                                }
                            });
                        };
                        return [4 /*yield*/, service.getCharacteristic(ATHENA_DATA_CHARACTERISTIC)];
                    case 1:
                        dataChar = _a.sent();
                        this.eegCharacteristics.push(dataChar);
                        return [4 /*yield*/, observableCharacteristic(dataChar)];
                    case 2:
                        (_a.sent()).subscribe(handleNotification);
                        if (!(discoveredUuids.indexOf(ATHENA_DATA2_CHARACTERISTIC) >= 0)) return [3 /*break*/, 7];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, service.getCharacteristic(ATHENA_DATA2_CHARACTERISTIC)];
                    case 4:
                        data2Char = _a.sent();
                        return [4 /*yield*/, observableCharacteristic(data2Char)];
                    case 5:
                        (_a.sent()).subscribe(handleNotification);
                        return [3 /*break*/, 7];
                    case 6:
                        err_9 = _a.sent();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.startAthena = function () {
        return __awaiter(this, void 0, void 0, function () {
            var preset, sequence, _i, sequence_1, step;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        preset = this.preset || (this.enablePpg ? 'p1041' : (this.enableAux ? 'p1045' : ATHENA_DEFAULT_PRESET));
                        this.preset = preset;
                        sequence = [
                            ['v6', 50],
                            ['s', 50],
                            ['h', 50],
                            [preset, 50],
                            ['s', 50],
                            ['dc001', 30],
                            ['dc001', 50],
                            ['L1', 50],
                            ['s', 50],
                        ];
                        _i = 0, sequence_1 = sequence;
                        _a.label = 1;
                    case 1:
                        if (!(_i < sequence_1.length)) return [3 /*break*/, 5];
                        step = sequence_1[_i];
                        return [4 /*yield*/, this.sendCommand(step[0])];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.delay(step[1])];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 1];
                    case 5:
                        if (!!this.athenaReceivedEEG) return [3 /*break*/, 7];
                        // Fallback for Athena fw 3.x that expects classic 'd'
                        return [4 /*yield*/, this.sendCommand('d')];
                    case 6:
                        // Fallback for Athena fw 3.x that expects classic 'd'
                        _a.sent();
                        _a.label = 7;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    MuseClient.prototype.getTimestamp = function (eventIndex, samplesPerReading, frequency) {
        var READING_DELTA = 1000 * (1.0 / frequency) * samplesPerReading;
        if (this.lastIndex === null || this.lastTimestamp === null) {
            this.lastIndex = eventIndex;
            this.lastTimestamp = new Date().getTime() - READING_DELTA;
        }
        // Handle wrap around
        while (this.lastIndex - eventIndex > 0x1000) {
            eventIndex += 0x10000;
        }
        if (eventIndex === this.lastIndex) {
            return this.lastTimestamp;
        }
        if (eventIndex > this.lastIndex) {
            this.lastTimestamp += READING_DELTA * (eventIndex - this.lastIndex);
            this.lastIndex = eventIndex;
            return this.lastTimestamp;
        }
        else {
            return this.lastTimestamp - READING_DELTA * (this.lastIndex - eventIndex);
        }
    };
    return MuseClient;
}());
export { MuseClient };
//# sourceMappingURL=muse.js.map