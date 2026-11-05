export declare const ATHENA_DATA_CHARACTERISTIC = "273e0013-4c4d-454d-96be-f03bac821358";
export declare const ATHENA_DATA2_CHARACTERISTIC = "273e0014-4c4d-454d-96be-f03bac821358";
export declare const ATHENA_EEG_SAMPLE_RATE = 256;
export declare const ATHENA_OPTICS_SAMPLE_RATE = 64;
export declare const ATHENA_MOTION_SAMPLE_RATE = 52;
export declare const ATHENA_EEG_SCALE: number;
export declare const ATHENA_EEG_MIDPOINT = 8192;
export declare const ATHENA_DEFAULT_PRESET = "p1035";
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
export declare const ATHENA_TAGS: {
    [tag: number]: AthenaTagSpec;
};
export declare function unpackLE(bytes: Uint8Array, offset: number, count: number, bits: number): number[];
export declare function athenaEegToMicrovolts(x: number): number;
export declare function parseAthenaNotification(bytes: Uint8Array, onSubpacket: (sub: AthenaSubpacket) => void): {
    packets: number;
    subpackets: number;
    skippedBytes: number;
};
