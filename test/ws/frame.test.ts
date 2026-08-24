import { describe, expect, it } from "vitest";
import {
	CloseCode,
	MAX_CONTROL_PAYLOAD,
	MAX_PAYLOAD_LENGTH_16BIT,
	Opcode,
} from "../../src/ws/constants";
import {
	buildFrame,
	buildFrameHeader,
} from "../../src/ws/frame/builder";
import { isValidCloseCode } from "../../src/ws/frame/close-code";
import { parseFrameInto, tryParseFrame } from "../../src/ws/frame/parser";
import { WebSocketProtocolError } from "../../src/ws/protocol-error";

function maskedFrame(
	opcode: number,
	payload: Buffer,
	options: { fin?: boolean; rsv1?: boolean; mask?: number[] } = {},
): Buffer {
	const fin = options.fin ?? true;
	const rsv1 = options.rsv1 ?? false;
	const mask = options.mask ?? [0x01, 0x02, 0x03, 0x04];

	const firstByte = opcode | (fin ? 0x80 : 0) | (rsv1 ? 0x40 : 0);
	let header: Buffer;

	if (payload.byteLength <= 125) {
		header = Buffer.from([firstByte, 0x80 | payload.byteLength]);
	} else if (payload.byteLength <= MAX_PAYLOAD_LENGTH_16BIT) {
		header = Buffer.alloc(4);
		header[0] = firstByte;
		header[1] = 0x80 | 126;
		header.writeUInt16BE(payload.byteLength, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = firstByte;
		header[1] = 0x80 | 127;
		header.writeBigUInt64BE(BigInt(payload.byteLength), 2);
	}

	const masked = Buffer.from(payload);
	for (let i = 0; i < masked.byteLength; i++) {
		masked[i] = masked[i] ^ mask[i % 4];
	}

	return Buffer.concat([header, Buffer.from(mask), masked]);
}

describe("buildFrameHeader", () => {
	it("uses the 7-bit length for payloads up to 125", () => {
		const header = buildFrameHeader(Opcode.Text, 125);
		expect(header.byteLength).toBe(2);
		expect(header[0]).toBe(0x80 | Opcode.Text);
		expect(header[1]).toBe(125);
	});

	it("uses the 16-bit extended length up to 65535", () => {
		const header = buildFrameHeader(Opcode.Binary, 30_000);
		expect(header.byteLength).toBe(4);
		expect(header[1]).toBe(126);
		expect(header.readUInt16BE(2)).toBe(30_000);
	});

	it("uses the 64-bit extended length above 65535", () => {
		const header = buildFrameHeader(Opcode.Binary, 70_000);
		expect(header.byteLength).toBe(10);
		expect(header[1]).toBe(127);
		expect(header.readBigUInt64BE(2)).toBe(BigInt(70_000));
	});

	it("sets the fin bit unless disabled", () => {
		const header = buildFrameHeader(Opcode.Text, 0, { fin: false });
		expect(header[0] & 0x80).toBe(0);
		const withFin = buildFrameHeader(Opcode.Text, 0);
		expect(withFin[0] & 0x80).toBe(0x80);
	});

	it("sets the rsv1 bit only when requested", () => {
		const header = buildFrameHeader(Opcode.Text, 0, { rsv1: true });
		expect(header[0] & 0x40).toBe(0x40);
		expect(buildFrameHeader(Opcode.Text, 0)[0] & 0x40).toBe(0);
	});

	it("never sets the masking bit (server frames)", () => {
		const frame = buildFrame(Opcode.Text, Buffer.from("hi"));
		expect(frame[1] & 0x80).toBe(0);
	});
});

describe("buildFrame", () => {
	it("concatenates header and payload", () => {
		const payload = Buffer.from("hola");
		const frame = buildFrame(Opcode.Text, payload);
		expect(frame.subarray(2)).toEqual(payload);
	});

	it("copies the payload so callers can reuse their buffer", () => {
		const payload = Buffer.from("original");
		const frame = buildFrame(Opcode.Text, payload);
		payload.fill(0);
		expect(frame.subarray(2).toString()).toBe("original");
	});
});

describe("parseFrameInto", () => {
	const out = () => ({
		fin: false,
		opcode: 0,
		payload: Buffer.alloc(0),
		rsv1: false,
	});

	it("returns null when fewer than 2 bytes are available", () => {
		expect(parseFrameInto(Buffer.from([0x81]), out(), {})).toBeNull();
	});

	it("returns null until the full frame has arrived", () => {
		const frame = maskedFrame(Opcode.Text, Buffer.from("hello"));
		const partial = frame.subarray(0, frame.byteLength - 1);
		expect(parseFrameInto(partial, out(), {})).toBeNull();
	});

	it("parses a masked text frame and unmasks the payload in place", () => {
		const frame = maskedFrame(Opcode.Text, Buffer.from("hello"), {
			mask: [0x12, 0x34, 0x56, 0x78],
		});
		const result = out();
		const consumed = parseFrameInto(frame, result, {});

		expect(consumed).toBe(frame.byteLength);
		expect(result.fin).toBe(true);
		expect(result.opcode).toBe(Opcode.Text);
		expect(result.payload).toEqual(Buffer.from("hello"));
		// The payload is a zero-copy view into the caller's buffer.
		expect(result.payload.buffer).toBe(frame.buffer);
	});

	it("parses a 16-bit extended length frame", () => {
		const payload = Buffer.alloc(200, 0xab);
		const frame = maskedFrame(Opcode.Binary, payload);
		const result = tryParseFrame(frame);

		expect(result?.frame.opcode).toBe(Opcode.Binary);
		expect(result?.frame.payload).toEqual(payload);
	});

	it("parses a 64-bit extended length frame", () => {
		const payload = Buffer.alloc(70_000, 0xcd);
		const frame = maskedFrame(Opcode.Binary, payload);
		const result = tryParseFrame(frame);

		expect(result?.frame.payload.byteLength).toBe(70_000);
		expect(result?.frame.payload[0]).toBe(0xcd);
	});

	it("rejects RSV2 and RSV3 bits", () => {
		const frame = Buffer.from([0x81 | 0x20, 0x80, 0, 0, 0, 0]);
		expect(() => parseFrameInto(frame, out(), {})).toThrow(
			WebSocketProtocolError,
		);
		expect(() => parseFrameInto(frame, out(), {})).toThrow(
			"Reserved bits are not supported",
		);
	});

	it("rejects RSV1 without allowRsv1", () => {
		const frame = maskedFrame(Opcode.Text, Buffer.from("x"), { rsv1: true });
		expect(() => parseFrameInto(frame, out(), {})).toThrow(
			"Reserved bits are not supported",
		);
	});

	it("accepts RSV1 when allowRsv1 is enabled", () => {
		const frame = maskedFrame(Opcode.Text, Buffer.from("x"), { rsv1: true });
		const result = tryParseFrame(frame, { allowRsv1: true });
		expect(result?.frame.rsv1).toBe(true);
		expect(result?.frame.payload).toEqual(Buffer.from("x"));
	});

	it("rejects unmasked client frames", () => {
		const frame = Buffer.from([0x81, 0x02, 0x41, 0x42]);
		expect(() => parseFrameInto(frame, out(), {})).toThrow(
			"Client frames must be masked",
		);
	});

	it("rejects a 64-bit length beyond MAX_SAFE_INTEGER with 1009", () => {
		const header = Buffer.alloc(10);
		header[0] = 0x82;
		header[1] = 0x80 | 127;
		header.writeBigUInt64BE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 2);
		const frame = Buffer.concat([header, Buffer.from([1, 2, 3, 4])]);

		try {
			parseFrameInto(frame, out(), {});
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(WebSocketProtocolError);
			expect((error as WebSocketProtocolError).closeCode).toBe(
				CloseCode.MessageTooBig,
			);
		}
	});

	it("rejects control frames with a payload over 125 bytes", () => {
		const payload = Buffer.alloc(MAX_CONTROL_PAYLOAD + 1, 0x01);
		const frame = maskedFrame(Opcode.Ping, payload);
		expect(() => parseFrameInto(frame, out(), {})).toThrow("Invalid control frame");
	});

	it("rejects fragmented (non-fin) control frames", () => {
		const frame = maskedFrame(Opcode.Ping, Buffer.from("x"), { fin: false });
		expect(() => parseFrameInto(frame, out(), {})).toThrow("Invalid control frame");
	});

	it("accepts an exactly-125-byte control frame", () => {
		const payload = Buffer.alloc(MAX_CONTROL_PAYLOAD, 0x01);
		const frame = maskedFrame(Opcode.Ping, payload);
		const result = tryParseFrame(frame);
		expect(result).not.toBeNull();
	});

	it("unmasks payloads above the unmask32 threshold", () => {
		const payload = Buffer.alloc(300);
		for (let i = 0; i < payload.byteLength; i++) payload[i] = i & 0xff;
		const frame = maskedFrame(Opcode.Binary, payload);
		const result = tryParseFrame(frame);
		expect(result?.frame.payload).toEqual(payload);
	});
});

describe("unmask32 with subarray-aligned buffer", () => {
	it("unmasks a payload that starts at a non-word-aligned byte offset", () => {
		const payload = Buffer.alloc(300);
		for (let i = 0; i < payload.byteLength; i++) payload[i] = i & 0xff;
		const frame = maskedFrame(Opcode.Binary, payload);

		// Prepend a single byte so the frame header (and therefore the payload
		// subarray) begins at a non-word-aligned offset within the input buffer,
		// forcing the three-pass unmask32 path to handle start alignment.
		const misaligned = Buffer.concat([Buffer.from([0xaa]), frame]);
		const result = tryParseFrame(misaligned.subarray(1));

		expect(result?.frame.payload.byteLength).toBe(payload.byteLength);
		expect(result?.frame.payload).toEqual(payload);
	});
});

describe("isValidCloseCode", () => {
	it("accepts every sendable close code", () => {
		for (const code of [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011]) {
			expect(isValidCloseCode(code)).toBe(true);
		}
	});

	it("accepts application and private codes in 3000-4999", () => {
		expect(isValidCloseCode(3000)).toBe(true);
		expect(isValidCloseCode(4000)).toBe(true);
		expect(isValidCloseCode(4999)).toBe(true);
	});

	it("rejects reserved and non-sendable codes", () => {
		for (const code of [
			1004, 1005, 1006, 1012, 1013, 1014, 1015, 2999, 5000, 100, 2000,
		]) {
			expect(isValidCloseCode(code)).toBe(false);
		}
	});
});