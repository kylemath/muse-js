// tslint:disable:no-bitwise object-literal-sort-keys
export var ATHENA_DATA_CHARACTERISTIC = '273e0013-4c4d-454d-96be-f03bac821358';
export var ATHENA_DATA2_CHARACTERISTIC = '273e0014-4c4d-454d-96be-f03bac821358';
export var ATHENA_EEG_SAMPLE_RATE = 256;
export var ATHENA_OPTICS_SAMPLE_RATE = 64;
export var ATHENA_MOTION_SAMPLE_RATE = 52;
export var ATHENA_EEG_SCALE = 1450 / 16383;
export var ATHENA_EEG_MIDPOINT = 8192;
export var ATHENA_DEFAULT_PRESET = 'p1035';
var PACKET_HEADER_SIZE = 9;
var SUBPACKET_HEADER_SIZE = 5;
var ACCELEROMETER_SCALE = 1 / 16384;
var GYROSCOPE_SCALE = -0.0074768;
export var ATHENA_TAGS = {
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
export function unpackLE(bytes, offset, count, bits) {
    var values = new Array(count);
    var mask = (1 << bits) - 1;
    var acc = 0;
    var accBits = 0;
    var pos = offset;
    for (var i = 0; i < count; i++) {
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
export function athenaEegToMicrovolts(x) {
    return (x - ATHENA_EEG_MIDPOINT) * ATHENA_EEG_SCALE;
}
function deinterleave(values, channels, samples) {
    var out = [];
    for (var ch = 0; ch < channels; ch++) {
        var column = new Array(samples);
        for (var s = 0; s < samples; s++) {
            column[s] = values[s * channels + ch];
        }
        out.push(column);
    }
    return out;
}
function decodePayload(spec, bytes, p) {
    var n = spec.channels * spec.samples;
    switch (spec.type) {
        case 'eeg': {
            var raw = deinterleave(unpackLE(bytes, p, n, 14), spec.channels, spec.samples);
            return { raw: raw, values: raw.map(function (ch) { return ch.map(athenaEegToMicrovolts); }) };
        }
        case 'optics': {
            var raw = deinterleave(unpackLE(bytes, p, n, 20), spec.channels, spec.samples);
            return { raw: raw, values: raw };
        }
        case 'motion': {
            var dv = new DataView(bytes.buffer, bytes.byteOffset + p, spec.bytes);
            var values = [];
            for (var i = 0; i < n; i++) {
                var v = dv.getInt16(i * 2, true);
                values.push(i % 6 < 3 ? v * ACCELEROMETER_SCALE : v * GYROSCOPE_SCALE);
            }
            return { raw: null, values: deinterleave(values, spec.channels, spec.samples) };
        }
        case 'drlref': {
            var dv = new DataView(bytes.buffer, bytes.byteOffset + p, spec.bytes);
            var values = [];
            for (var i = 0; i < n; i++) {
                values.push(dv.getUint16(i * 2, true));
            }
            return { raw: null, values: deinterleave(values, spec.channels, spec.samples) };
        }
        case 'battery': {
            var percent = Math.min(100, Math.max(0, (bytes[p] | (bytes[p + 1] << 8)) / 256));
            return { raw: null, values: [[percent]] };
        }
    }
}
export function parseAthenaNotification(bytes, onSubpacket) {
    var packets = 0;
    var subpackets = 0;
    var skippedBytes = 0;
    var offset = 0;
    while (offset < bytes.length) {
        var length_1 = bytes[offset];
        if (length_1 < PACKET_HEADER_SIZE + SUBPACKET_HEADER_SIZE || offset + length_1 > bytes.length) {
            skippedBytes += bytes.length - offset;
            break;
        }
        var end = offset + length_1;
        var packetCounter = bytes[offset + 1] | (bytes[offset + 2] << 8);
        var i = offset + PACKET_HEADER_SIZE;
        while (i + SUBPACKET_HEADER_SIZE <= end) {
            var tag = bytes[i];
            var spec = ATHENA_TAGS[tag];
            if (!spec) {
                break;
            }
            var p = i + SUBPACKET_HEADER_SIZE;
            if (spec.variableLength) {
                if (p + 2 > end) {
                    break;
                }
                var decoded = decodePayload(spec, bytes, p);
                onSubpacket({
                    type: spec.type,
                    tag: tag,
                    index: bytes[i + 1],
                    packetCounter: packetCounter,
                    raw: decoded.raw,
                    values: decoded.values,
                });
                subpackets++;
                var fixedNext = p + spec.bytes;
                if (fixedNext <= end && (fixedNext === end || ATHENA_TAGS[bytes[fixedNext]])) {
                    i = fixedNext;
                }
                else {
                    i = end;
                }
                continue;
            }
            if (p + spec.bytes > end) {
                break;
            }
            var payload = decodePayload(spec, bytes, p);
            onSubpacket({
                type: spec.type,
                tag: tag,
                index: bytes[i + 1],
                packetCounter: packetCounter,
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
    return { packets: packets, subpackets: subpackets, skippedBytes: skippedBytes };
}
//# sourceMappingURL=athena-parse.js.map