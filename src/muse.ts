import { BehaviorSubject, fromEvent, merge, Observable, Subject } from 'rxjs';
import { filter, first, map, share, take } from 'rxjs/operators';

import {
    ATHENA_DATA2_CHARACTERISTIC,
    ATHENA_DATA_CHARACTERISTIC,
    ATHENA_DEFAULT_PRESET,
    ATHENA_EEG_SAMPLE_RATE,
    ATHENA_EEG_SCALE,
    ATHENA_OPTICS_SAMPLE_RATE,
    athenaEegToMicrovolts,
    AthenaSubpacket,
    parseAthenaNotification,
    unpackLE,
} from './lib/athena-parse';
import {
    AccelerometerData,
    EEGReading,
    EventMarker,
    GyroscopeData,
    MuseControlResponse,
    MuseDeviceInfo,
    PPGReading,
    TelemetryData,
    XYZ,
} from './lib/muse-interfaces';
import {
    decodeEEGSamples,
    decodePPGSamples,
    parseAccelerometer,
    parseControl,
    parseGyroscope,
    parseTelemetry,
} from './lib/muse-parse';
import { decodeResponse, encodeCommand, observableCharacteristic } from './lib/muse-utils';

export { zipSamples, EEGSample } from './lib/zip-samples';
export { zipSamplesPpg, PPGSample } from './lib/zip-samplesPpg';
export {
    EEGReading,
    PPGReading,
    TelemetryData,
    AccelerometerData,
    GyroscopeData,
    XYZ,
    MuseControlResponse,
    MuseDeviceInfo,
    ATHENA_DATA_CHARACTERISTIC,
    ATHENA_DATA2_CHARACTERISTIC,
    ATHENA_DEFAULT_PRESET,
    ATHENA_EEG_SCALE,
    athenaEegToMicrovolts,
    parseAthenaNotification,
    unpackLE,
};

export const MUSE_SERVICE = 0xfe8d;
const CONTROL_CHARACTERISTIC = '273e0001-4c4d-454d-96be-f03bac821358';
const TELEMETRY_CHARACTERISTIC = '273e000b-4c4d-454d-96be-f03bac821358';
const GYROSCOPE_CHARACTERISTIC = '273e0009-4c4d-454d-96be-f03bac821358';
const ACCELEROMETER_CHARACTERISTIC = '273e000a-4c4d-454d-96be-f03bac821358';
const PPG_CHARACTERISTICS = [
    '273e000f-4c4d-454d-96be-f03bac821358', // ambient 0x37-0x39
    '273e0010-4c4d-454d-96be-f03bac821358', // infrared 0x3a-0x3c
    '273e0011-4c4d-454d-96be-f03bac821358', // red 0x3d-0x3f
];
export const PPG_FREQUENCY = 64;
export const PPG_SAMPLES_PER_READING = 6;
const EEG_CHARACTERISTICS = [
    '273e0003-4c4d-454d-96be-f03bac821358',
    '273e0004-4c4d-454d-96be-f03bac821358',
    '273e0005-4c4d-454d-96be-f03bac821358',
    '273e0006-4c4d-454d-96be-f03bac821358',
    '273e0007-4c4d-454d-96be-f03bac821358',
];
export const EEG_FREQUENCY = 256;
export const EEG_SAMPLES_PER_READING = 12;

// These names match the characteristics defined in PPG_CHARACTERISTICS above
export const ppgChannelNames = ['ambient', 'infrared', 'red'];

// These names match the characteristics defined in EEG_CHARACTERISTICS above
export const channelNames = ['TP9', 'AF7', 'AF8', 'TP10', 'AUX'];

export class MuseClient {
    enableAux = false;
    enablePpg = false;
    isAthena = false;
    preset: string | null = null;
    deviceName: string | null = '';
    connectionStatus = new BehaviorSubject<boolean>(false);
    rawControlData: Observable<string>;
    controlResponses: Observable<MuseControlResponse>;
    telemetryData: Observable<TelemetryData>;
    gyroscopeData: Observable<GyroscopeData>;
    accelerometerData: Observable<AccelerometerData>;
    eegReadings: Observable<EEGReading>;
    ppgReadings: Observable<PPGReading>;
    eventMarkers: Subject<EventMarker>;

    private gatt: BluetoothRemoteGATTServer | null = null;
    private controlChar: BluetoothRemoteGATTCharacteristic;
    private eegCharacteristics: BluetoothRemoteGATTCharacteristic[];
    private ppgCharacteristics: BluetoothRemoteGATTCharacteristic[];

    private lastIndex: number | null = null;
    private lastTimestamp: number | null = null;
    private athenaSeqTracker = new Map<string, { seq: number; count: number }>();
    private athenaStartWallTime: number | null = null;
    private athenaReceivedEEG = false;

    async connect(gatt?: BluetoothRemoteGATTServer) {
        if (gatt) {
            this.gatt = gatt;
        } else {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [MUSE_SERVICE] }],
            });
            this.gatt = await device.gatt!.connect();
        }
        this.deviceName = this.gatt.device.name || null;

        let service = await this.gatt.getPrimaryService(MUSE_SERVICE);
        fromEvent(this.gatt.device, 'gattserverdisconnected')
            .pipe(first())
            .subscribe(() => {
                this.gatt = null;
                this.connectionStatus.next(false);
            });

        // Control
        this.controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
        this.rawControlData = (await observableCharacteristic(this.controlChar)).pipe(
            map((data) => decodeResponse(new Uint8Array(data.buffer))),
            share(),
        );
        this.controlResponses = parseControl(this.rawControlData);

        this.eventMarkers = new Subject();
        this.isAthena = false;
        this.athenaSeqTracker.clear();
        this.athenaStartWallTime = null;
        this.athenaReceivedEEG = false;

        // Detect Muse S Athena (universal sensor characteristic 273e0013) when getCharacteristics() is populated
        let discoveredUuids: string[] = [];
        if (typeof service.getCharacteristics === 'function') {
            try {
                const chars = await service.getCharacteristics();
                discoveredUuids = chars.map((c) => c.uuid.toLowerCase());
            } catch (err) {
                discoveredUuids = [];
            }
        }

        if (
            discoveredUuids.indexOf(ATHENA_DATA_CHARACTERISTIC) >= 0 &&
            discoveredUuids.indexOf(EEG_CHARACTERISTICS[0]) === -1
        ) {
            this.isAthena = true;
            await this.setupAthenaStreams(service, discoveredUuids);
            this.connectionStatus.next(true);
            return;
        }

        // Battery (optional — Muse 2016 may not expose 273e000b)
        try {
            const telemetryCharacteristic = await service.getCharacteristic(TELEMETRY_CHARACTERISTIC);
            this.telemetryData = (await observableCharacteristic(telemetryCharacteristic)).pipe(map(parseTelemetry));
        } catch (err) {
            this.telemetryData = new Subject<TelemetryData>();
        }

        // Gyroscope (optional)
        try {
            const gyroscopeCharacteristic = await service.getCharacteristic(GYROSCOPE_CHARACTERISTIC);
            this.gyroscopeData = (await observableCharacteristic(gyroscopeCharacteristic)).pipe(map(parseGyroscope));
        } catch (err) {
            this.gyroscopeData = new Subject<GyroscopeData>();
        }

        // Accelerometer (optional)
        try {
            const accelerometerCharacteristic = await service.getCharacteristic(ACCELEROMETER_CHARACTERISTIC);
            this.accelerometerData = (await observableCharacteristic(accelerometerCharacteristic)).pipe(
                map(parseAccelerometer),
            );
        } catch (err) {
            this.accelerometerData = new Subject<AccelerometerData>();
        }

        // PPG
        if (this.enablePpg) {
            this.ppgCharacteristics = [];
            const ppgObservables: Array<Observable<PPGReading>> = [];
            const ppgChannelCount = PPG_CHARACTERISTICS.length;
            for (let ppgChannelIndex = 0; ppgChannelIndex < ppgChannelCount; ppgChannelIndex++) {
                try {
                    const characteristicId = PPG_CHARACTERISTICS[ppgChannelIndex];
                    const ppgChar = await service.getCharacteristic(characteristicId);
                    ppgObservables.push(
                        (await observableCharacteristic(ppgChar)).pipe(
                            map((data) => {
                                const eventIndex = data.getUint16(0);
                                return {
                                    index: eventIndex,
                                    ppgChannel: ppgChannelIndex,
                                    samples: decodePPGSamples(new Uint8Array(data.buffer).subarray(2)),
                                    timestamp: this.getTimestamp(eventIndex, PPG_SAMPLES_PER_READING, PPG_FREQUENCY),
                                };
                            }),
                        ),
                    );
                    this.ppgCharacteristics.push(ppgChar);
                } catch (err) {
                    // PPG characteristic not available on this model
                }
            }
            this.ppgReadings = ppgObservables.length ? merge(...ppgObservables) : new Subject<PPGReading>();
        }

        // Check if EEG characteristics are available; on Muse 2016 (MU-02) they may require
        // a wake/init sequence before appearing in the GATT table.
        let eegAvailable = true;
        try {
            await service.getCharacteristic(EEG_CHARACTERISTICS[0]);
        } catch (err) {
            eegAvailable = false;
        }

        if (!eegAvailable) {
            // Maybe an Athena device on a platform where getCharacteristics() was restricted
            try {
                await service.getCharacteristic(ATHENA_DATA_CHARACTERISTIC);
                this.isAthena = true;
                await this.setupAthenaStreams(service, [ATHENA_DATA_CHARACTERISTIC]);
                this.connectionStatus.next(true);
                return;
            } catch (err) {
                // Proceed with Muse 2016 lazy-GATT wake sequence
            }

            await this.sendCommand('v1');
            await this.delay(100);
            await this.sendCommand('h');
            await this.sendCommand('p21');
            await this.sendCommand('s');
            await this.sendCommand('d');
            await this.delay(500);

            try {
                await service.getCharacteristic(EEG_CHARACTERISTICS[0]);
                eegAvailable = true;
            } catch (err) {
                if (this.gatt && this.gatt.device && this.gatt.device.gatt) {
                    const device = this.gatt.device;
                    if (this.gatt.connected) {
                        this.gatt.disconnect();
                    }
                    await this.delay(500);
                    this.gatt = await device.gatt!.connect();
                    service = await this.gatt.getPrimaryService(MUSE_SERVICE);
                    this.controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
                    this.rawControlData = (await observableCharacteristic(this.controlChar)).pipe(
                        map((data) => decodeResponse(new Uint8Array(data.buffer))),
                        share(),
                    );
                    this.controlResponses = parseControl(this.rawControlData);
                }
            }
        }

        // EEG
        this.eegCharacteristics = [];
        const eegObservables: Array<Observable<EEGReading>> = [];
        const channelCount = this.enableAux ? EEG_CHARACTERISTICS.length : 4;
        for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
            const characteristicId = EEG_CHARACTERISTICS[channelIndex];
            const eegChar = await service.getCharacteristic(characteristicId);
            eegObservables.push(
                (await observableCharacteristic(eegChar)).pipe(
                    map((data) => {
                        const eventIndex = data.getUint16(0);
                        return {
                            electrode: channelIndex,
                            index: eventIndex,
                            samples: decodeEEGSamples(new Uint8Array(data.buffer).subarray(2)),
                            timestamp: this.getTimestamp(eventIndex, EEG_SAMPLES_PER_READING, EEG_FREQUENCY),
                        };
                    }),
                ),
            );
            this.eegCharacteristics.push(eegChar);
        }
        this.eegReadings = merge(...eegObservables);
        this.connectionStatus.next(true);
    }

    async sendCommand(cmd: string) {
        await this.controlChar.writeValue(encodeCommand(cmd));
    }

    async start() {
        if (this.isAthena) {
            await this.startAthena();
            return;
        }
        await this.pause();
        let preset = 'p21';
        if (this.enablePpg) {
            preset = 'p50';
        } else if (this.enableAux) {
            preset = 'p20';
        }

        await this.controlChar.writeValue(encodeCommand(preset));
        await this.controlChar.writeValue(encodeCommand('s'));
        await this.resume();
    }

    async pause() {
        await this.sendCommand('h');
    }

    async resume() {
        if (this.isAthena) {
            await this.sendCommand('dc001');
            await this.delay(50);
            await this.sendCommand('dc001');
            return;
        }
        await this.sendCommand('d');
    }

    async deviceInfo() {
        const resultListener = this.controlResponses
            .pipe(
                filter((r) => !!r.fw),
                take(1),
            )
            .toPromise();
        await this.sendCommand('v1');
        return resultListener as Promise<MuseDeviceInfo>;
    }

    async injectMarker(value: string | number, timestamp: number = new Date().getTime()) {
        await this.eventMarkers.next({ value, timestamp });
    }

    disconnect() {
        if (this.gatt) {
            this.lastIndex = null;
            this.lastTimestamp = null;
            this.athenaSeqTracker.clear();
            this.athenaStartWallTime = null;
            this.gatt.disconnect();
            this.connectionStatus.next(false);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private trackAthenaSubpacket(tag: number, seqIndex: number, samplesPerSubpacket: number, sampleRate: number) {
        if (this.athenaStartWallTime === null) {
            this.athenaStartWallTime = new Date().getTime();
        }
        const key = `tag_${tag}`;
        const last = this.athenaSeqTracker.get(key);
        let unwrappedCount = 0;
        if (last) {
            const step = (seqIndex - last.seq + 256) % 256 || 1;
            unwrappedCount = last.count + step;
        }
        this.athenaSeqTracker.set(key, { seq: seqIndex, count: unwrappedCount });
        const sampleIndex = unwrappedCount * samplesPerSubpacket;
        const timestamp = this.athenaStartWallTime + (sampleIndex * 1000) / sampleRate;
        return { unwrappedCount, timestamp };
    }

    private async setupAthenaStreams(service: BluetoothRemoteGATTService, discoveredUuids: string[]) {
        const eegSubject = new Subject<EEGReading>();
        const ppgSubject = new Subject<PPGReading>();
        const telemetrySubject = new Subject<TelemetryData>();
        const accelSubject = new Subject<AccelerometerData>();
        const gyroSubject = new Subject<GyroscopeData>();

        this.eegReadings = eegSubject.asObservable();
        this.ppgReadings = ppgSubject.asObservable();
        this.telemetryData = telemetrySubject.asObservable();
        this.accelerometerData = accelSubject.asObservable();
        this.gyroscopeData = gyroSubject.asObservable();
        this.eegCharacteristics = [];
        this.ppgCharacteristics = [];

        const handleNotification = (data: DataView) => {
            const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            parseAthenaNotification(bytes, (sub: AthenaSubpacket) => {
                if (sub.type === 'eeg') {
                    this.athenaReceivedEEG = true;
                    const nSamples = sub.values[0] ? sub.values[0].length : 4;
                    const tracked = this.trackAthenaSubpacket(sub.tag, sub.index, nSamples, ATHENA_EEG_SAMPLE_RATE);
                    const maxCh = this.enableAux ? Math.min(sub.values.length, 5) : Math.min(sub.values.length, 4);
                    for (let ch = 0; ch < maxCh; ch++) {
                        eegSubject.next({
                            electrode: ch,
                            index: tracked.unwrappedCount,
                            samples: sub.values[ch],
                            timestamp: tracked.timestamp,
                        });
                    }
                } else if (sub.type === 'optics') {
                    const nSamples = sub.values[0] ? sub.values[0].length : 3;
                    const tracked = this.trackAthenaSubpacket(sub.tag, sub.index, nSamples, ATHENA_OPTICS_SAMPLE_RATE);
                    const mappedChannels =
                        sub.values.length >= 16
                            ? [sub.values[14], sub.values[6], sub.values[12]]
                            : sub.values.slice(0, 3);
                    for (let ch = 0; ch < mappedChannels.length; ch++) {
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
                } else if (sub.type === 'motion') {
                    // tslint:disable:object-literal-sort-keys
                    accelSubject.next({
                        sequenceId: sub.index,
                        samples: [0, 1, 2].map((i) => ({
                            x: sub.values[0][i],
                            y: sub.values[1][i],
                            z: sub.values[2][i],
                        })),
                    });
                    gyroSubject.next({
                        sequenceId: sub.index,
                        samples: [0, 1, 2].map((i) => ({
                            x: sub.values[3][i],
                            y: sub.values[4][i],
                            z: sub.values[5][i],
                        })),
                    });
                    // tslint:enable:object-literal-sort-keys
                } else if (sub.type === 'battery') {
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

        const dataChar = await service.getCharacteristic(ATHENA_DATA_CHARACTERISTIC);
        this.eegCharacteristics.push(dataChar);
        (await observableCharacteristic(dataChar)).subscribe(handleNotification);

        if (discoveredUuids.indexOf(ATHENA_DATA2_CHARACTERISTIC) >= 0) {
            try {
                const data2Char = await service.getCharacteristic(ATHENA_DATA2_CHARACTERISTIC);
                (await observableCharacteristic(data2Char)).subscribe(handleNotification);
            } catch (err) {
                // Secondary Athena characteristic is optional
            }
        }
    }

    private async startAthena() {
        const defaultAthenaPreset = this.enablePpg
            ? 'p1041'
            : this.enableAux
            ? 'p1045'
            : ATHENA_DEFAULT_PRESET;
        const preset = this.preset || defaultAthenaPreset;
        this.preset = preset;
        const sequence: Array<[string, number]> = [
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
        for (const step of sequence) {
            await this.sendCommand(step[0]);
            await this.delay(step[1]);
        }
        if (!this.athenaReceivedEEG) {
            // Fallback for Athena fw 3.x that expects classic 'd'
            await this.sendCommand('d');
        }
    }

    private getTimestamp(eventIndex: number, samplesPerReading: number, frequency: number) {
        const READING_DELTA = 1000 * (1.0 / frequency) * samplesPerReading;
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
        } else {
            return this.lastTimestamp - READING_DELTA * (this.lastIndex - eventIndex);
        }
    }
}
