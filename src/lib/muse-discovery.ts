// Utility functions for discovering Bluetooth characteristics on unknown Muse devices

export interface DiscoveredCharacteristics {
    control?: BluetoothRemoteGATTCharacteristic;
    telemetry?: BluetoothRemoteGATTCharacteristic;
    gyroscope?: BluetoothRemoteGATTCharacteristic;
    accelerometer?: BluetoothRemoteGATTCharacteristic;
    eeg: BluetoothRemoteGATTCharacteristic[];
    ppg: BluetoothRemoteGATTCharacteristic[];
    unknown: Array<{ uuid: string; characteristic: BluetoothRemoteGATTCharacteristic }>;
}

const KNOWN_CHARACTERISTICS = {
    CONTROL: '273e0001-4c4d-454d-96be-f03bac821358',
    TELEMETRY: '273e000b-4c4d-454d-96be-f03bac821358',
    GYROSCOPE: '273e0009-4c4d-454d-96be-f03bac821358',
    ACCELEROMETER: '273e000a-4c4d-454d-96be-f03bac821358',
    EEG: [
        '273e0003-4c4d-454d-96be-f03bac821358',
        '273e0004-4c4d-454d-96be-f03bac821358',
        '273e0005-4c4d-454d-96be-f03bac821358',
        '273e0006-4c4d-454d-96be-f03bac821358',
        '273e0007-4c4d-454d-96be-f03bac821358',
    ],
    PPG: [
        '273e000f-4c4d-454d-96be-f03bac821358', // ambient
        '273e0010-4c4d-454d-96be-f03bac821358', // infrared
        '273e0011-4c4d-454d-96be-f03bac821358', // red
    ],
};

export async function discoverCharacteristics(service: BluetoothRemoteGATTService): Promise<DiscoveredCharacteristics> {
    const discovered: DiscoveredCharacteristics = {
        eeg: [],
        ppg: [],
        unknown: [],
    };

    try {
        // Get all characteristics from the service
        const allCharacteristics = await service.getCharacteristics();

        console.log(`Found ${allCharacteristics.length} characteristics on device`);

        for (const char of allCharacteristics) {
            const uuid = char.uuid.toLowerCase();
            console.log(`Characteristic found: ${uuid}`);

            // Categorize known characteristics
            if (uuid === KNOWN_CHARACTERISTICS.CONTROL.toLowerCase()) {
                discovered.control = char;
            } else if (uuid === KNOWN_CHARACTERISTICS.TELEMETRY.toLowerCase()) {
                discovered.telemetry = char;
            } else if (uuid === KNOWN_CHARACTERISTICS.GYROSCOPE.toLowerCase()) {
                discovered.gyroscope = char;
            } else if (uuid === KNOWN_CHARACTERISTICS.ACCELEROMETER.toLowerCase()) {
                discovered.accelerometer = char;
            } else if (KNOWN_CHARACTERISTICS.EEG.some((eegUuid) => eegUuid.toLowerCase() === uuid)) {
                discovered.eeg.push(char);
            } else if (KNOWN_CHARACTERISTICS.PPG.some((ppgUuid) => ppgUuid.toLowerCase() === uuid)) {
                discovered.ppg.push(char);
            } else {
                discovered.unknown.push({ uuid, characteristic: char });
            }
        }

        console.log('Discovery results:', {
            control: !!discovered.control,
            telemetry: !!discovered.telemetry,
            gyroscope: !!discovered.gyroscope,
            accelerometer: !!discovered.accelerometer,
            eeg: discovered.eeg.length,
            ppg: discovered.ppg.length,
            unknown: discovered.unknown.length,
        });
    } catch (error) {
        console.error('Failed to discover characteristics:', error);
    }

    return discovered;
}

export async function safeGetCharacteristic(
    service: BluetoothRemoteGATTService,
    uuid: string,
    name: string,
): Promise<BluetoothRemoteGATTCharacteristic | null> {
    try {
        console.log(`Attempting to get ${name} characteristic: ${uuid}`);
        const characteristic = await service.getCharacteristic(uuid);
        console.log(`✅ Successfully got ${name} characteristic`);
        return characteristic;
    } catch (error) {
        console.warn(`❌ Failed to get ${name} characteristic: ${error.message}`);
        return null;
    }
}
