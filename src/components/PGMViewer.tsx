// src/utils/ImageViewer.ts
import { BinaryParser } from "./BinaryParser";

export default class ImageViewer {
    width: number;
    height: number;
    maxVal: number;
    data: Uint8Array;
    private parser: BinaryParser;

    constructor(arrayBuffer: ArrayBuffer) {
        // Read the header (first 100 bytes should be enough)
        const headerText = new TextDecoder("utf-8").decode(
            arrayBuffer.slice(0, 100),
        );
        const headerExp = /^P5\s+(?:#.*\s)*(\d+)\s+(\d+)\s+(\d+)/;
        const match = headerText.match(headerExp);
        if (!match) {
            throw new TypeError(
                "Sorry, file does not appear to be a valid PGM file.",
            );
        }

        // Parse header values.
        this.width = parseInt(match[1], 10);
        this.height = parseInt(match[2], 10);
        this.maxVal = parseInt(match[3], 10);

        // Calculate header length.
        const headerEnd =
            headerText.indexOf("\n" + this.maxVal) +
            `\n${this.maxVal}`.length +
            1;
        const imageDataBuffer = arrayBuffer.slice(headerEnd);

        // Determine bytes per sample.
        const bytes = this.maxVal < 256 ? 1 : 2;
        this.parser = new BinaryParser(imageDataBuffer, bytes);
        this.data = this.parser.getAllSamples();
    }
}