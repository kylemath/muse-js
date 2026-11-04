// tslint:disable:no-bitwise object-literal-sort-keys
import { TextDecoder, TextEncoder } from 'text-encoding';
import { DeviceMock, WebBluetoothMock } from 'web-bluetooth-mock';
import { MuseClient, zipSamples } from './../muse';
import {
    ATHENA_DATA_CHARACTERISTIC,
    ATHENA_EEG_SCALE,
    athenaEegToMicrovolts,
    AthenaSubpacket,
    parseAthenaNotification,
    unpackLE,
} from './athena-parse';

declare var global: any;

function packLE(values: number[], bits: number, byteLength: number): Uint8Array {
    const out = new Uint8Array(byteLength);
    let bit = 0;
    for (const v of values) {
        for (let b = 0; b < bits; b++, bit++) {
            if ((v >> b) & 1) {
                out[bit >> 3] |= 1 << (bit & 7);
            }
        }
    }
    return out;
}

function buildSubpacket(tag: number, index: number, payload: number[] | Uint8Array): number[] {
    const arr = Array.prototype.slice.call(payload);
    return [tag, index, 0xaa, 0xbb, 0xcc].concat(arr);
}

function buildPacket(counter: number, subpackets: number[][]): Uint8Array {
    let body: number[] = [];
    for (const sp of subpackets) {
        body = body.concat(sp);
    }
    const length = 9 + body.length;
    return new Uint8Array([length, counter & 0xff, (counter >> 8) & 0xff, 1, 2, 3, 0x89, 0x93, 0x01].concat(body));
}

function buildEeg4Subpacket(index: number, rows: number[][]): number[] {
    let flat: number[] = [];
    for (const r of rows) {
        flat = flat.concat(r);
    }
    return buildSubpacket(0x11, index, packLE(flat, 14, 28));
}

describe('athena-parse', () => {
    beforeEach(() => {
        Object.assign(global, { TextDecoder, TextEncoder });
    });

    it('unpackLE should read 14-bit and 20-bit values LSB first across byte boundaries', () => {
        const values = [0, 1, 8192, 16383, 1234, 5678, 9999, 42];
        expect(unpackLE(packLE(values, 14, 14), 0, 8, 14)).toEqual(values);

        const optics = [0, 1, 0xfffff, 0x12345, 0xabcde, 7];
        expect(unpackLE(packLE(optics, 20, 15), 0, 6, 20)).toEqual(optics);
    });

    it('should decode 4-channel EEG subpackets (tag 0x11) into microvolts', () => {
        const rows = [0, 1, 2, 3].map((s) => [0, 1, 2, 3].map((ch) => 8192 + 100 * ch + s));
        const subs: AthenaSubpacket[] = [];
        const pkt = buildPacket(7, [buildEeg4Subpacket(5, rows)]);
        const result = parseAthenaNotification(pkt, (s) => subs.push(s));

        expect(result).toEqual({ packets: 1, subpackets: 1, skippedBytes: 0 });
        expect(subs.length).toBe(1);
        expect(subs[0].type).toBe('eeg');
        expect(subs[0].index).toBe(5);
        expect(subs[0].packetCounter).toBe(7);
        expect(subs[0].raw![2]).toEqual([8392, 8393, 8394, 8395]);
        subs[0].values[2].forEach((v, i) => {
            expect(Math.abs(v - athenaEegToMicrovolts(8392 + i))).toBeLessThan(1e-9);
        });
        expect(subs[0].values[0][0]).toBe(0);
    });

    it('should decode multiplexed optics, battery, motion, and EEG in a single packet', () => {
        const opticsVals: number[] = [];
        for (let i = 0; i < 12; i++) {
            opticsVals.push(1000 * i);
        }
        const optics = buildSubpacket(0x34, 1, packLE(opticsVals, 20, 30));

        const motionPayload = new Uint8Array(36);
        const dv = new DataView(motionPayload.buffer);
        for (let s = 0; s < 3; s++) {
            dv.setInt16((s * 6 + 0) * 2, 16384, true); // ax = 1 g
            dv.setInt16((s * 6 + 3) * 2, -100, true); // gx
        }
        const motion = buildSubpacket(0x47, 2, motionPayload);

        const batteryPayload = [0x00, 0x3a];
        for (let i = 0; i < 18; i++) {
            batteryPayload.push(0xee);
        }
        const battery = buildSubpacket(0x88, 3, batteryPayload);
        const rows = [0, 1, 2, 3].map(() => [8192, 8192, 8192, 8192]);
        const bytes = buildPacket(1, [optics, battery, motion, buildEeg4Subpacket(9, rows)]);

        const types: string[] = [];
        let opticsOut: number[][] = [];
        let motionOut: number[][] = [];
        let batteryPercent = 0;
        const result = parseAthenaNotification(bytes, (s) => {
            types.push(s.type);
            if (s.type === 'optics') {
                opticsOut = s.values;
            }
            if (s.type === 'motion') {
                motionOut = s.values;
            }
            if (s.type === 'battery') {
                batteryPercent = s.values[0][0];
            }
        });

        expect(types).toEqual(['optics', 'battery', 'motion', 'eeg']);
        expect(result.skippedBytes).toBe(0);
        expect(opticsOut[1]).toEqual([1000, 5000, 9000]);
        expect(motionOut[0]).toEqual([1, 1, 1]);
        expect(Math.abs(motionOut[3][0] - 0.74768)).toBeLessThan(1e-9);
        expect(batteryPercent).toBe(58);
    });

    it('should detect Muse S Athena in MuseClient, stream EEG/Telemetry/IMU, and work with zipSamples', async () => {
        const museDevice = new DeviceMock('MuseS-Athena', [0xfe8d]);
        global.navigator = global.navigator || {};
        global.navigator.bluetooth = new WebBluetoothMock([museDevice]);

        const service = museDevice.getServiceMock(0xfe8d);
        service.getCharacteristicMock('273e0001-4c4d-454d-96be-f03bac821358');
        const athenaChar = service.getCharacteristicMock(ATHENA_DATA_CHARACTERISTIC);

        const client = new MuseClient();
        await client.connect();
        expect(client.isAthena).toBe(true);

        const zippedSamples: any[] = [];
        zipSamples(client.eegReadings).subscribe((s) => zippedSamples.push(s));

        let batteryLevel = -1;
        client.telemetryData.subscribe((t) => {
            batteryLevel = t.batteryLevel;
        });

        await client.start();
        expect(client.preset).toBe('p1035');

        const rows0 = [0, 1, 2, 3].map((s) => [0, 1, 2, 3].map((ch) => 8192 + 100 * ch + s));
        const rows1 = [0, 1, 2, 3].map((s) => [0, 1, 2, 3].map((ch) => 8192 + 100 * ch + s + 10));
        const batPayload = [0x00, 0x4b];
        for (let i = 0; i < 18; i++) {
            batPayload.push(0);
        }
        const pkt = buildPacket(1, [
            buildEeg4Subpacket(0, rows0),
            buildEeg4Subpacket(1, rows1),
            buildSubpacket(0x98, 1, batPayload),
        ]);
        athenaChar.value = new DataView(pkt.buffer);
        athenaChar.dispatchEvent(new CustomEvent('characteristicvaluechanged'));

        expect(batteryLevel).toBe(75);
        expect(zippedSamples.length).toBe(4);
        expect(zippedSamples[0].data[0]).toBe(0);
        expect(Math.abs(zippedSamples[0].data[1] - 100 * ATHENA_EEG_SCALE)).toBeLessThan(1e-6);
        expect(Math.abs(zippedSamples[3].data[2] - 203 * ATHENA_EEG_SCALE)).toBeLessThan(1e-6);
    });

    it('should connect to Muse 2016 even when telemetry/IMU characteristics are missing', async () => {
        const museDevice = new DeviceMock('Muse-2016', [0xfe8d]);
        global.navigator = global.navigator || {};
        global.navigator.bluetooth = new WebBluetoothMock([museDevice]);

        const service = museDevice.getServiceMock(0xfe8d);
        const origGetChar = service.getCharacteristic.bind(service);
        service.getCharacteristic = (uuid: string) => {
            if (
                uuid === '273e000b-4c4d-454d-96be-f03bac821358' ||
                uuid === '273e0009-4c4d-454d-96be-f03bac821358' ||
                uuid === '273e000a-4c4d-454d-96be-f03bac821358'
            ) {
                return Promise.reject(new Error('No Characteristics matching UUID'));
            }
            return origGetChar(uuid);
        };

        const client = new MuseClient();
        await client.connect();
        expect(client.isAthena).toBe(false);
        expect(client.eegReadings).toBeDefined();
        expect(client.telemetryData).toBeDefined();
        expect(client.accelerometerData).toBeDefined();
        expect(client.gyroscopeData).toBeDefined();
    });
});
