export class BinaryParser {
    private buffer: ArrayBuffer;
    private bytesPerSample: number;
    private dataView: DataView;
    private maxVal?: number;

    constructor(buffer: ArrayBuffer, bytesPerSample: number, maxVal?: number) {
        this.buffer = buffer;
        this.bytesPerSample = bytesPerSample;
        this.maxVal = maxVal;
        this.dataView = new DataView(buffer);
    }

    getAllSamples(): Uint8Array {
        if (this.bytesPerSample === 1) {
            return new Uint8Array(this.buffer);
        } else {
            const length = this.buffer.byteLength / 2;
            const samples = new Uint8Array(length);

            for (let i = 0; i < length; i++) {
                // Detect endianness and read the correct format
                const value = this.dataView.getUint16(i * 2, true); // Try little-endian

                // If maxVal is available, use proper scaling
                if (this.maxVal && this.maxVal > 0) {
                    samples[i] = Math.round((value / this.maxVal) * 255);
                } else {
                    samples[i] = value >> 8;
                }
            }

            return samples;
        }
    }
}