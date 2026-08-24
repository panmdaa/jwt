import {
	CloseCode,
	MAX_CONTROL_PAYLOAD,
	type Opcode,
	UNMASK_LOOP_THRESHOLD,
} from "../constants";
import { WebSocketProtocolError } from "../protocol-error";

export interface ParsedFrame {
	fin: boolean;
	opcode: Opcode;
	payload: Buffer;
	rsv1: boolean;
}

export interface FrameParseOptions {
	allowRsv1?: boolean;
}

/**
 * Parses a single WebSocket frame from the head of `buffer`, filling the
 * reusable `out` object. Returns the number of bytes consumed, or `null` when
 * more data is needed. Throws {@link WebSocketProtocolError} on protocol
 * violations.
 *
 * This is the allocation-free fast path used by the connection hot loop.
 */
export function parseFrameInto(
	buffer: Buffer,
	out: ParsedFrame,
	options: FrameParseOptions = {},
): number | null {
	if (buffer.byteLength < 2) {
		return null;
	}

	const firstByte = buffer[0] ?? 0;
	const secondByte = buffer[1] ?? 0;

	const rsv1 = (firstByte & 0x40) === 0x40;

	if ((firstByte & 0x30) !== 0 || (rsv1 && !options.allowRsv1)) {
		throw new WebSocketProtocolError("Reserved bits are not supported");
	}

	const fin = (firstByte & 0x80) === 0x80;
	const opcode = firstByte & 0x0f;
	const masked = (secondByte & 0x80) === 0x80;

	if (!masked) {
		throw new WebSocketProtocolError("Client frames must be masked");
	}

	let payloadLength = secondByte & 0x7f;
	let offset = 2;

	if (payloadLength === 126) {
		if (buffer.byteLength < 4) {
			return null;
		}

		payloadLength = buffer.readUInt16BE(2);
		offset = 4;
	} else if (payloadLength === 127) {
		if (buffer.byteLength < 10) {
			return null;
		}

		const length = buffer.readBigUInt64BE(2);

		if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new WebSocketProtocolError(
				"Payload length exceeds JavaScript limits",
				CloseCode.MessageTooBig,
			);
		}

		payloadLength = Number(length);
		offset = 10;
	}

	const isControl = opcode >= 0x08;

	if (isControl && (rsv1 || !fin || payloadLength > MAX_CONTROL_PAYLOAD)) {
		throw new WebSocketProtocolError("Invalid control frame");
	}

	if (buffer.byteLength < offset + 4 + payloadLength) {
		return null;
	}

	const mask0 = buffer[offset] ?? 0;
	const mask1 = buffer[offset + 1] ?? 0;
	const mask2 = buffer[offset + 2] ?? 0;
	const mask3 = buffer[offset + 3] ?? 0;
	const payload = buffer.subarray(offset + 4, offset + 4 + payloadLength);

	unmaskPayload(payload, mask0, mask1, mask2, mask3);

	out.fin = fin;
	out.opcode = opcode;
	out.payload = payload;
	out.rsv1 = rsv1;

	return offset + 4 + payloadLength;
}

export function tryParseFrame(
	buffer: Buffer,
	options: FrameParseOptions = {},
): { consumed: number; frame: ParsedFrame } | null {
	const out: ParsedFrame = {
		fin: false,
		opcode: 0,
		payload: Buffer.alloc(0),
		rsv1: false,
	};
	const consumed = parseFrameInto(buffer, out, options);

	if (consumed === null) {
		return null;
	}

	return { consumed, frame: out };
}

/**
 * Unmasks a frame payload in place. Small payloads take an unrolled byte
 * loop; larger payloads XOR four bytes at a time through a native-endian
 * `Uint32Array` view, rotating the mask word to absorb any start alignment.
 * Fully internal and dependency-free.
 */
function unmaskPayload(
	payload: Buffer,
	mask0: number,
	mask1: number,
	mask2: number,
	mask3: number,
): void {
	if (payload.byteLength < UNMASK_LOOP_THRESHOLD) {
		unmask8(payload, mask0, mask1, mask2, mask3);
		return;
	}

	unmask32(payload, mask0, mask1, mask2, mask3);
}

function unmask8(
	payload: Buffer,
	mask0: number,
	mask1: number,
	mask2: number,
	mask3: number,
): void {
	const length = payload.byteLength;
	let index = 0;
	const next = length - 7;

	for (; index < next; index += 8) {
		payload[index] = (payload[index] ?? 0) ^ mask0;
		payload[index + 1] = (payload[index + 1] ?? 0) ^ mask1;
		payload[index + 2] = (payload[index + 2] ?? 0) ^ mask2;
		payload[index + 3] = (payload[index + 3] ?? 0) ^ mask3;
		payload[index + 4] = (payload[index + 4] ?? 0) ^ mask0;
		payload[index + 5] = (payload[index + 5] ?? 0) ^ mask1;
		payload[index + 6] = (payload[index + 6] ?? 0) ^ mask2;
		payload[index + 7] = (payload[index + 7] ?? 0) ^ mask3;
	}

	for (; index < length; index += 1) {
		payload[index] =
			(payload[index] ?? 0) ^ maskByte(mask0, mask1, mask2, mask3, index);
	}
}

function unmask32(
	payload: Buffer,
	mask0: number,
	mask1: number,
	mask2: number,
	mask3: number,
): void {
	const length = payload.byteLength;
	const buffer = payload.buffer;
	const offset = payload.byteOffset;
	const startAligned = (offset + 3) & ~3;
	const endAligned = (offset + length) & ~3;
	const alignedWords = (endAligned - startAligned) / 4;

	if (alignedWords <= 0) {
		unmask8(payload, mask0, mask1, mask2, mask3);
		return;
	}

	const prefix = startAligned - offset;
	const rotation = prefix & 3;
	const word =
		((maskByte(mask0, mask1, mask2, mask3, rotation) & 0xff) |
			((maskByte(mask0, mask1, mask2, mask3, rotation + 1) & 0xff) << 8) |
			((maskByte(mask0, mask1, mask2, mask3, rotation + 2) & 0xff) << 16) |
			((maskByte(mask0, mask1, mask2, mask3, rotation + 3) & 0xff) << 24)) >>>
		0;
	const suffixStart = prefix + (endAligned - startAligned);

	for (let i = 0; i < prefix; i += 1) {
		payload[i] = (payload[i] ?? 0) ^ maskByte(mask0, mask1, mask2, mask3, i);
	}

	const view = new Uint32Array(buffer, startAligned, alignedWords);

	for (let k = 0; k < view.length; k += 1) {
		view[k] = view[k] ^ word;
	}

	for (let i = suffixStart; i < length; i += 1) {
		payload[i] = (payload[i] ?? 0) ^ maskByte(mask0, mask1, mask2, mask3, i);
	}
}

function maskByte(
	mask0: number,
	mask1: number,
	mask2: number,
	mask3: number,
	index: number,
): number {
	switch (index & 3) {
		case 1:
			return mask1;
		case 2:
			return mask2;
		case 3:
			return mask3;
		default:
			return mask0;
	}
}
