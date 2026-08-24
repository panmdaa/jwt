import {
	MAX_PAYLOAD_LENGTH_7BIT,
	MAX_PAYLOAD_LENGTH_16BIT,
	type Opcode,
} from "../constants";

export interface FrameBuildOptions {
	fin?: boolean;
	rsv1?: boolean;
}

export function buildFrame(
	opcode: Opcode,
	payload: Buffer,
	options: FrameBuildOptions = {},
): Buffer {
	const header = buildFrameHeader(opcode, payload.byteLength, options);
	const frame = Buffer.allocUnsafe(header.byteLength + payload.byteLength);
	header.copy(frame, 0);
	payload.copy(frame, header.byteLength);
	return frame;
}

export function buildFrameHeader(
	opcode: Opcode,
	payloadLength: number,
	options: FrameBuildOptions = {},
): Buffer {
	const fin = options.fin ?? true;
	const rsv1 = options.rsv1 ?? false;
	let offset = 2;
	let encodedLength = payloadLength;

	if (encodedLength > MAX_PAYLOAD_LENGTH_7BIT) {
		if (encodedLength <= MAX_PAYLOAD_LENGTH_16BIT) {
			offset += 2;
			encodedLength = 126;
		} else {
			offset += 8;
			encodedLength = 127;
		}
	}

	const header = Buffer.allocUnsafe(offset);
	header[0] = opcode | (fin ? 0x80 : 0) | (rsv1 ? 0x40 : 0);
	header[1] = encodedLength;

	if (encodedLength === 126) {
		header.writeUInt16BE(payloadLength, 2);
	} else if (encodedLength === 127) {
		header.writeBigUInt64BE(BigInt(payloadLength), 2);
	}

	return header;
}
