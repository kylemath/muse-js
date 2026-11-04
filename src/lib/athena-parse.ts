// tslint:disable:no-bitwise object-literal-sort-keys

export const ATHENA_DATA_CHARACTERISTIC = '273e0013-4c4d-454d-96be-f03bac821358';
export const ATHENA_DATA2_CHARACTERISTIC = '273e0014-4c4d-454d-96be-f03bac821358';

export const ATHENA_EEG_SAMPLE_RATE = 256;
export const ATHENA_OPTICS_SAMPLE_RATE = 64;
export const ATHENA_MOTION_SAMPLE_RATE = 52;

export const ATHENA_EEG_SCALE = 1450 / 16383;
export const ATHENA_EEG_MIDPOINT = 8192;
export const ATHENA_DEFAULT_PRESET = 'p1035';

const PACKET_HEADER_SIZE = 9;
const SUBPACKET_HEADER_SIZE = 5;
const ACCELEROMETER_SCALE = 1 / 16384;
const GYROSCOPE_SCALE = -0.0074768;

export interface AthenaTagSpec {
    type: 'eeg' | 'optics' | 'motion' | 'drlref' | 'battery';
    channels: number;
    samples: number;
    bytes: number;
    variableLength?: boolean;
}

export interface AthenaSubpacket {
    type: 'eeg' | 'optics' | 'motion' | 'drlref' | 'battery';
    tag: number;
    index: number;
    packetCounter: number;
    raw: number[][] | null;
    values: number[][];
}

export const ATHENA_TAGS: { [tag: number]: AthenaTagSpec } = {
    0x11: { type: 'eeg', channels: 4, samples: 4, bytes: 28 },
    0x12: { type: 'eeg', channels: 8, samples: 2, bytes: 28 },
    0x34: { type: 'optics', channels: 4, samples: 3, bytes: 30 },
    0x35: { type: 'optics', channels: 8, samples: 2, bytes: 40 },
    0x36: { type: 'optics', channels: 16, samples: 1, bytes: 40 },
    0x47: { type: 'motion', channels: 6, samples: 3, bytes: 36 },
    0x53: { type: 'drlref', channels: 2, samples: 6, bytes: 24 },
    0x88: { type: 'battery', channels: 1, samples: 1, bytes: 20, variableLength: true },
    0x98: { type: 'battery', channels: 1, samples: 1, bytes: 20 },
};

export function unpackLE(bytes: Uint8Array, offset: number, count: number, bits: number): number[] {
    const values = new Array<number>(count);
    const mask = (1 << bits) - 1;
    let acc = 0;
    let accBits = 0;
    let pos = offset;
    for (let i = 0; i < count; i++) {
        while (accBits < bits) {
            acc |= bytes[pos++] << accBits;
            accBits += 8;
        }
        values[i] = acc & mask;
        acc >>>= bits;
        accBits -= bits;
    }
    return values;
}

export function athenaEegToMicrovolts(x: number): number {
    return (x - ATHENA_EEG_MIDPOINT) * ATHENA_EEG_SCALE;
}

function deinterleave(values: number[], channels: number, samples: number): number[][] {
    const out: number[][] = [];
    for (let ch = 0; ch < channels; ch++) {
        const column = new Array<number>(samples);
        for (let s = 0; s < samples; s++) {
            column[s] = values[s * channels + ch];
        }
        out.push(column);
    }
    return out;
}

function decodePayload(
    spec: AthenaTagSpec,
    bytes: Uint8Array,
    p: number,
): { raw: number[][] | null; values: number[][] } {
    const n = spec.channels * spec.samples;
    switch (spec.type) {
        case 'eeg': {
            const raw = deinterleave(unpackLE(bytes, p, n, 14), spec.channels, spec.samples);
            return { raw, values: raw.map((ch) => ch.map(athenaEegToMicrovolts)) };
        }
        case 'optics': {
            const raw = deinterleave(unpackLE(bytes, p, n, 20), spec.channels, spec.samples);
            return { raw, values: raw };
        }
        case 'motion': {
            const dv = new DataView(bytes.buffer, bytes.byteOffset + p, spec.bytes);
            const values: number[] = [];
            for (let i = 0; i < n; i++) {
                const v = dv.getInt16(i * 2, true);
                values.push(i % 6 < 3 ? v * ACCELEROMETER_SCALE : v * GYROSCOPE_SCALE);
            }
            return { raw: null, values: deinterleave(values, spec.channels, spec.samples) };
        }
        case 'drlref': {
            const dv = new DataView(bytes.buffer, bytes.byteOffset + p, spec.bytes);
            const values: number[] = [];
            for (let i = 0; i < n; i++) {
                values.push(dv.getUint16(i * 2, true));
            }
            return { raw: null, values: deinterleave(values, spec.channels, spec.samples) };
        }
        case 'battery': {
            const percent = Math.min(100, Math.max(0, (bytes[p] | (bytes[p + 1] << 8)) / 256));
            return { raw: null, values: [[percent]] };
        }
    }
}

export function parseAthenaNotification(
    bytes: Uint8Array,
    onSubpacket: (sub: AthenaSubpacket) => void,
): { packets: number; subpackets: number; skippedBytes: number } {
    let packets = 0;
    let subpackets = 0;
    let skippedBytes = 0;
    let offset = 0;

    while (offset < bytes.length) {
        const length = bytes[offset];
        if (length < PACKET_HEADER_SIZE + SUBPACKET_HEADER_SIZE || offset + length > bytes.length) {
            skippedBytes += bytes.length - offset;
            break;
        }
        const end = offset + length;
        const packetCounter = bytes[offset + 1] | (bytes[offset + 2] << 8);
        let i = offset + PACKET_HEADER_SIZE;

        while (i + SUBPACKET_HEADER_SIZE <= end) {
            const tag = bytes[i];
            const spec = ATHENA_TAGS[tag];
            if (!spec) {
                break;
            }
            const p = i + SUBPACKET_HEADER_SIZE;
            if (spec.variableLength) {
                if (p + 2 > end) {
                    break;
                }
                const decoded = decodePayload(spec, bytes, p);
                onSubpacket({
                    type: spec.type,
                    tag,
                    index: bytes[i + 1],
                    packetCounter,
                    raw: decoded.raw,
                    values: decoded.values,
                });
                subpackets++;
                const fixedNext = p + spec.bytes;
                if (fixedNext <= end && (fixedNext === end || ATHENA_TAGS[bytes[fixedNext]])) {
                    i = fixedNext;
                } else {
                    i = end;
                }
                continue;
            }

            if (p + spec.bytes > end) {
                break;
            }
            const payload = decodePayload(spec, bytes, p);
            onSubpacket({
                type: spec.type,
                tag,
                index: bytes[i + 1],
                packetCounter,
                raw: payload.raw,
                values: payload.values,
            });
            subpackets++;
            i = p + spec.bytes;
        }

        skippedBytes += end - i;
        packets++;
        offset = end;
    }

    return { packets, subpackets, skippedBytes };
}
