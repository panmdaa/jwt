import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createWebSocket } from "../../src/ws/connection";
import {
	CloseCode,
	MAX_CONTROL_PAYLOAD,
	Opcode,
	WebSocketState,
} from "../../src/ws/constants";
import type { WebSocketProtocolError } from "../../src/ws/protocol-error";

class MockSocket extends EventEmitter {
	writableLength = 0;
	destroyed = false;
	written: Buffer[] = [];
	private ended = false;

	write(chunk: Buffer | string): boolean {
		this.written.push(Buffer.from(chunk));
		return true;
	}

	setNoDelay(): void {}

	cork(): void {}

	uncork(): void {}

	pause(): void {}

	resume(): void {}

	end(): void {
		if (!this.ended) {
			this.ended = true;
			setImmediate(() => {
				this.emit("end");
				this.emit("close");
			});
		}
	}

	destroy(): void {
		if (!this.destroyed) {
			this.destroyed = true;
			setImmediate(() => this.emit("close"));
		}
	}

	feed(chunk: Buffer): void {
		this.emit("data", chunk);
	}
}

/** Parses server frames (unmasked) out of the written bytes. */
function parseServerFrames(socket: MockSocket): Array<{
	opcode: number;
	fin: boolean;
	payload: Buffer;
}> {
	const buffer = Buffer.concat(socket.written);
	const frames: Array<{ opcode: number; fin: boolean; payload: Buffer }> = [];
	let offset = 0;

	while (offset + 2 <= buffer.byteLength) {
		const firstByte = buffer[offset];
		const secondByte = buffer[offset + 1];
		const opcode = firstByte & 0x0f;
		const fin = (firstByte & 0x80) === 0x80;
		let length = secondByte & 0x7f;
		let headerLen = 2;

		if (length === 126) {
			length = buffer.readUInt16BE(offset + 2);
			headerLen = 4;
		} else if (length === 127) {
			length = Number(buffer.readBigUInt64BE(offset + 2));
			headerLen = 10;
		}

		if (offset + headerLen + length > buffer.byteLength) break;
		const payload = buffer.subarray(
			offset + headerLen,
			offset + headerLen + length,
		);
		frames.push({ opcode, fin, payload });
		offset += headerLen + length;
	}

	return frames;
}

/** Builds a client frame (masked). */
function clientFrame(
	opcode: number,
	payload: Buffer,
	options: { fin?: boolean; rsv1?: boolean } = {},
): Buffer {
	const fin = options.fin ?? true;
	const firstByte = opcode | (fin ? 0x80 : 0) | (options.rsv1 ? 0x40 : 0);
	const mask = Buffer.from([0x01, 0x02, 0x03, 0x04]);
	const masked = Buffer.from(payload);
	for (let i = 0; i < masked.byteLength; i++) masked[i] ^= mask[i % 4];
	let header: Buffer;

	if (payload.byteLength <= 125) {
		header = Buffer.from([firstByte, 0x80 | payload.byteLength]);
	} else {
		header = Buffer.alloc(4);
		header[0] = firstByte;
		header[1] = 0x80 | 126;
		header.writeUInt16BE(payload.byteLength, 2);
	}

	return Buffer.concat([header, mask, masked]);
}

function openConnection(overrides: Record<string, unknown> = {}) {
	const socket = new MockSocket();
	const connection = createWebSocket(socket as never, {
		autoPong: true,
		closeTimeout: 100,
		maxPayload: 1024,
		...overrides,
	});
	return { socket, connection };
}

describe("WebSocketConnection outbound", () => {
	it("sends a text frame for send()", () => {
		const { socket, connection } = openConnection();
		connection.send("hola");
		const frames = parseServerFrames(socket);
		expect(frames).toHaveLength(1);
		expect(frames[0].opcode).toBe(Opcode.Text);
		expect(frames[0].payload.toString()).toBe("hola");
	});

	it("sends a binary frame for sendBinary()", () => {
		const { socket, connection } = openConnection();
		connection.sendBinary(Buffer.from([1, 2, 3]));
		const frames = parseServerFrames(socket);
		expect(frames[0].opcode).toBe(Opcode.Binary);
		expect(frames[0].payload).toEqual(Buffer.from([1, 2, 3]));
	});

	it("accepts Uint8Array, ArrayBuffer and views in sendBinary", () => {
		const { socket, connection } = openConnection();
		connection.sendBinary(new Uint8Array([1]));
		connection.sendBinary(new Uint8Array([2]).buffer as ArrayBuffer);
		connection.sendBinary(
			new DataView(new Uint8Array([3, 4, 5]).buffer, 1, 2),
		);
		const frames = parseServerFrames(socket);
		expect(frames.map((f) => f.payload)).toEqual([
			Buffer.from([1]),
			Buffer.from([2]),
			Buffer.from([4, 5]),
		]);
	});

	it("enforces the 125-byte limit on ping and pong payloads", () => {
		const { connection } = openConnection();
		const big = Buffer.alloc(MAX_CONTROL_PAYLOAD + 1);
		expect(() => connection.ping(big)).toThrow(
			"Ping payloads must be 125 bytes or smaller",
		);
		expect(() => connection.pong(big)).toThrow(
			"Pong payloads must be 125 bytes or smaller",
		);
	});

	it("rejects an invalid close code with a RangeError", () => {
		const { connection } = openConnection();
		expect(() => connection.close(1005)).toThrow('Invalid close code "1005"');
		expect(() => connection.close(1012)).toThrow('Invalid close code "1012"');
	});

	it("rejects a close reason longer than 123 bytes", () => {
		const { connection } = openConnection();
		expect(() => connection.close(1000, "x".repeat(124))).toThrow(
			"Close reason must be 123 bytes or smaller",
		);
	});

	it("throws when sending after the connection is closed", () => {
		const { connection } = openConnection();
		connection.terminate();
		expect(() => connection.send("nope")).toThrow("WebSocket is not open");
		expect(() => connection.ping()).toThrow("WebSocket is not open");
	});
});

describe("WebSocketConnection inbound", () => {
	it("emits text, binary and message events", () => {
		const { socket, connection } = openConnection();
		const texts: string[] = [];
		const binaries: Buffer[] = [];
		const messages: Array<{ data: string | Uint8Array; isBinary: boolean }> = [];
		connection.on("text", (d) => texts.push(d));
		connection.on("binary", (d) => binaries.push(Buffer.from(d)));
		connection.on("message", (e) => messages.push(e));

		socket.feed(clientFrame(Opcode.Text, Buffer.from("hello")));
		socket.feed(clientFrame(Opcode.Binary, Buffer.from([0xde, 0xad])));

		expect(texts).toEqual(["hello"]);
		expect(binaries).toEqual([Buffer.from([0xde, 0xad])]);
		expect(messages).toEqual([
			{ data: "hello", isBinary: false },
			{ data: Buffer.from([0xde, 0xad]), isBinary: true },
		]);
	});

	it("does not emit message/text events when nothing is listening", () => {
		const { socket, connection } = openConnection();
		socket.feed(clientFrame(Opcode.Text, Buffer.from("quiet")));
		expect(connection.listenerCount("message")).toBe(0);
		expect(connection.listenerCount("text")).toBe(0);
	});

	it("assembles fragmented text messages", () => {
		const { socket, connection } = openConnection();
		const texts: string[] = [];
		connection.on("text", (d) => texts.push(d));

		socket.feed(clientFrame(Opcode.Text, Buffer.from("Hel"), { fin: false }));
		socket.feed(clientFrame(Opcode.Continuation, Buffer.from("lo"), { fin: false }));
		socket.feed(clientFrame(Opcode.Continuation, Buffer.from("!"), { fin: true }));

		expect(texts).toEqual(["Hello!"]);
	});

	it("rejects a continuation frame with no active message", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(Opcode.Continuation, Buffer.from("x")));

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Unexpected continuation frame");
		expect(errors[0].closeCode).toBe(CloseCode.ProtocolError);
	});

	it("rejects a new data frame while a fragmented message is in progress", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(Opcode.Text, Buffer.from("A"), { fin: false }));
		socket.feed(clientFrame(Opcode.Binary, Buffer.from("B")));

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("A fragmented message is already in progress");
	});

	it("closes with 1007 on invalid UTF-8 text", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(Opcode.Text, Buffer.from([0xff, 0xfe, 0x41])));

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Received invalid UTF-8 data");
		expect(errors[0].closeCode).toBe(CloseCode.InvalidFramePayloadData);
	});

	it("accepts invalid UTF-8 when skipUTF8Validation is enabled", () => {
		const { socket, connection } = openConnection({ skipUTF8Validation: true });
		const texts: string[] = [];
		connection.on("text", (d) => texts.push(d));

		socket.feed(clientFrame(Opcode.Text, Buffer.from([0xff, 0xfe, 0x41])));

		expect(texts).toEqual(["\ufffd\ufffdA"]);
	});

	it("closes with 1009 when a message exceeds maxPayload", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(Opcode.Binary, Buffer.alloc(2048)));

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Message exceeds the configured max payload");
		expect(errors[0].closeCode).toBe(CloseCode.MessageTooBig);
	});

	it("applies maxPayload to the assembled fragmented message", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(Opcode.Binary, Buffer.alloc(700), { fin: false }));
		socket.feed(
			clientFrame(Opcode.Continuation, Buffer.alloc(700), { fin: true }),
		);

		expect(errors).toHaveLength(1);
		expect(errors[0].closeCode).toBe(CloseCode.MessageTooBig);
	});

	it("auto-answers pings with a pong carrying the same payload", () => {
		const { socket, connection } = openConnection();
		const pings: Buffer[] = [];
		connection.on("ping", (d) => pings.push(Buffer.from(d)));

		socket.feed(clientFrame(Opcode.Ping, Buffer.from("abc")));

		expect(pings).toEqual([Buffer.from("abc")]);
		const frames = parseServerFrames(socket);
		expect(frames).toHaveLength(1);
		expect(frames[0].opcode).toBe(Opcode.Pong);
		expect(frames[0].payload).toEqual(Buffer.from("abc"));
	});

	it("does not auto-pong when disabled", () => {
		const { socket, connection } = openConnection({ autoPong: false });
		connection.on("ping", () => {});

		socket.feed(clientFrame(Opcode.Ping, Buffer.from("abc")));

		expect(parseServerFrames(socket)).toHaveLength(0);
	});

	it("echoes a close frame and reports a clean close", async () => {
		const { socket, connection } = openConnection();
		const closePromise = new Promise<{
			code: number;
			reason: string;
			wasClean: boolean;
		}>((resolve) => connection.on("close", (e) => resolve(e)));

		socket.feed(
			clientFrame(
				Opcode.Close,
				Buffer.concat([Buffer.from([0x03, 0xe8]), Buffer.from("bye")]),
			),
		);

		const close = await closePromise;
		expect(close).toEqual({ code: 1000, reason: "bye", wasClean: true });
		const frames = parseServerFrames(socket);
		expect(frames[0].opcode).toBe(Opcode.Close);
		expect(frames[0].payload.readUInt16BE(0)).toBe(1000);
	});

	it("rejects a close frame with a 1-byte payload", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(Opcode.Close, Buffer.from([0x03])));

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe(
			"Close frames must be empty or include a two-byte close code",
		);
	});

	it("rejects a close frame with an invalid close code", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(
			clientFrame(Opcode.Close, Buffer.from([0x03, 0xed])), // 1005
		);

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Invalid close code");
	});

	it("rejects unsupported opcodes", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(clientFrame(0x03, Buffer.from("x")));

		expect(errors).toHaveLength(1);
		expect(errors[0].closeCode).toBe(CloseCode.ProtocolError);
	});

	it("rejects a compressed message when permessage-deflate is not enabled", () => {
		const { socket, connection } = openConnection();
		const errors: WebSocketProtocolError[] = [];
		connection.on("error", (e) => errors.push(e as WebSocketProtocolError));

		socket.feed(
			clientFrame(Opcode.Text, Buffer.from("deflated"), { rsv1: true }),
		);

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Reserved bits are not supported");
	});
});

describe("WebSocketConnection lifecycle", () => {
	it("starts in the OPEN state", () => {
		const { connection } = openConnection();
		expect(connection.readyState).toBe(WebSocketState.OPEN);
	});

	it("transitions to CLOSING when close() is called and CLOSED on socket close", async () => {
		const { socket, connection } = openConnection();
		const closePromise = new Promise<{ code: number; reason: string }>(
			(resolve) => connection.on("close", (e) => resolve(e)),
		);

		connection.close(1000, "done");

		expect(connection.readyState).toBe(WebSocketState.CLOSING);
		expect(parseServerFrames(socket)[0].opcode).toBe(Opcode.Close);
		const close = await closePromise;
		expect(close).toEqual({ code: 1000, reason: "done", wasClean: true });
		expect(connection.readyState).toBe(WebSocketState.CLOSED);
	});

	it("is idempotent when close() is called twice", () => {
		const { socket, connection } = openConnection();
		connection.close(1000, "first");
		const written = socket.written.length;
		connection.close(1001, "second");
		expect(socket.written.length).toBe(written);
	});

	it("emits drain events from the underlying socket", () => {
		const { socket, connection } = openConnection();
		let drains = 0;
		connection.on("drain", () => drains++);
		socket.emit("drain");
		expect(drains).toBe(1);
	});
});