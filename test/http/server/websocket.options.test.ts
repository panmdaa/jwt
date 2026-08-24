import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { connect as netConnect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Server } from "../../../src/http/server/server";
import { createWebSocketHeartbeat } from "../../../src/ws/heartbeat";
import { deflateRawSync, inflateRawSync, constants } from "node:zlib";

const SYNC_FLUSH_TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);

const servers: Server[] = [];

function listen(server: Server): Promise<number> {
	servers.push(server);
	return new Promise((resolve) => {
		server.listen(0);
		waitForAddress(server, resolve);
	});
}

function waitForAddress(server: Server, resolve: (port: number) => void): void {
	const address = server.address();
	if (address) {
		resolve((address as AddressInfo).port);
		return;
	}
	setTimeout(() => waitForAddress(server, resolve), 5);
}

/** Raw-socket WebSocket client with handshake + frame support. */
class TestClient {
	private buffer = Buffer.alloc(0);
	private listeners: Array<{
		event: string;
		fn: (...args: unknown[]) => void;
	}> = [];
	private handshakeDone = false;
	private handshakeResolve: ((status: number) => void) | undefined;

	constructor(private readonly socket: Socket) {
		socket.on("data", (chunk: Buffer) => {
			this.buffer = Buffer.concat([this.buffer, chunk]);
			this.pump();
		});
		socket.on("error", () => this.emit("error", new Error("socket error")));
		socket.on("close", () => this.emit("close"));
	}

	on(event: string, fn: (...args: unknown[]) => void): void {
		this.listeners.push({ event, fn });
	}

	emit(event: string, ...args: unknown[]): void {
		for (const l of this.listeners) {
			if (l.event === event) l.fn(...args);
		}
	}

	connect(
		path = "/",
		options: { method?: string; subprotocol?: string; extensions?: string } = {},
	): void {
		const key = "dGhlIHNhbXBsZSBub25jZQ==";
		const headers = [
			`${options.method ?? "GET"} ${path} HTTP/1.1`,
			"Host: localhost",
			"Upgrade: websocket",
			"Connection: Upgrade",
			`Sec-WebSocket-Key: ${key}`,
			"Sec-WebSocket-Version: 13",
		];
		if (options.subprotocol) {
			headers.push(`Sec-WebSocket-Protocol: ${options.subprotocol}`);
		}
		if (options.extensions) {
			headers.push(`Sec-WebSocket-Extensions: ${options.extensions}`);
		}
		this.socket.write([...headers, "", ""].join("\r\n"));
	}

	open(
		path = "/",
		options: { method?: string; subprotocol?: string; extensions?: string } = {},
	): Promise<{ status: number; headers: Record<string, string> }> {
		return new Promise((resolve, reject) => {
			this.handshakeResolve = (status) =>
				resolve({ status, headers: this.lastHeaders });
			this.lastHeaders = {};
			this.socket.once("error", reject);
			this.socket.once("connect", () => this.connect(path, options));
		});
	}

	private lastHeaders: Record<string, string> = {};

	sendText(message: string): void {
		this.sendFrame(0x1, Buffer.from(message));
	}

	sendBinary(data: Buffer): void {
		this.sendFrame(0x2, data);
	}

	ping(payload: Buffer = Buffer.alloc(0)): void {
		this.sendFrame(0x9, payload);
	}

	pong(payload: Buffer = Buffer.alloc(0)): void {
		this.sendFrame(0xa, payload);
	}

	sendClose(code = 1000, reason = ""): void {
		const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
		payload.writeUInt16BE(code, 0);
		Buffer.from(reason).copy(payload, 2);
		this.sendFrame(0x8, payload);
	}

	private sendFrame(opcode: number, payload: Buffer): void {
		const mask = Buffer.from([1, 2, 3, 4]);
		const masked = Buffer.from(payload);
		for (let i = 0; i < masked.byteLength; i++) {
			masked[i] = masked[i] ^ mask[i % 4];
		}

		const header = Buffer.alloc(2);
		header[0] = 0x80 | opcode;
		if (masked.byteLength <= 125) {
			header[1] = 0x80 | masked.byteLength;
			this.socket.write(Buffer.concat([header, mask, masked]));
			return;
		}
		if (masked.byteLength <= 65_535) {
			header[1] = 0x80 | 126;
			const len = Buffer.alloc(2);
			len.writeUInt16BE(masked.byteLength, 0);
			this.socket.write(Buffer.concat([header, len, mask, masked]));
			return;
		}
		header[1] = 0x80 | 127;
		const len = Buffer.alloc(8);
		len.writeBigUInt64BE(BigInt(masked.byteLength), 0);
		this.socket.write(Buffer.concat([header, len, mask, masked]));
	}

	private pump(): void {
		if (!this.handshakeDone) {
			const idx = this.buffer.indexOf("\r\n\r\n");
			if (idx === -1) return;
			const head = this.buffer.subarray(0, idx).toString("latin1");
			this.handshakeDone = true;
			this.buffer = this.buffer.subarray(idx + 4);
			const resolve = this.handshakeResolve;
			this.handshakeResolve = undefined;
			const status = Number(head.split(" ")[1] ?? "0");
			for (const line of head.split("\r\n").slice(1)) {
				const colon = line.indexOf(":");
				if (colon === -1) continue;
				this.lastHeaders[line.slice(0, colon).trim().toLowerCase()] =
					line.slice(colon + 1).trim();
			}
			resolve?.(status);

			// Frames may arrive in the same chunk as the handshake. Defer their
			// processing so the caller's await resolves (microtask) and can
			// register listeners before any emitted events.
			setImmediate(() => this.pump());
			return;
		}

		for (;;) {
			const frame = this.parseFrame();
			if (!frame) return;
			const eventType =
				frame.opcode === 0x1
					? "text"
					: frame.opcode === 0x2
						? "binary"
						: frame.opcode === 0x8
							? "close"
							: frame.opcode === 0x9
								? "ping"
								: frame.opcode === 0xa
									? "pong"
									: "message";
			const payload = frame.compressed
				? this.inflate(frame.payload)
				: frame.payload;
			this.emit(eventType, payload);
		}
	}

	private inflate(payload: Buffer): Buffer {
		const complete = Buffer.allocUnsafe(
			payload.byteLength + SYNC_FLUSH_TRAILER.byteLength,
		);
		payload.copy(complete, 0);
		SYNC_FLUSH_TRAILER.copy(complete, payload.byteLength);
		return inflateRawSync(complete, {
			finishFlush: constants.Z_SYNC_FLUSH,
		});
	}

	private parseFrame(): { opcode: number; payload: Buffer; compressed: boolean } | null {
		if (this.buffer.byteLength < 2) return null;
		const firstByte = this.buffer[0];
		const opcode = firstByte & 0x0f;
		const compressed = (firstByte & 0x40) === 0x40;
		let payloadLength = this.buffer[1] & 0x7f;
		let offset = 2;

		if (payloadLength === 126) {
			if (this.buffer.byteLength < 4) return null;
			payloadLength = this.buffer.readUInt16BE(2);
			offset = 4;
		} else if (payloadLength === 127) {
			if (this.buffer.byteLength < 10) return null;
			payloadLength = Number(this.buffer.readBigUInt64BE(2));
			offset = 10;
		}

		const masked = (this.buffer[1] & 0x80) === 0x80;
		const maskOffset = masked ? 4 : 0;
		if (this.buffer.byteLength < offset + maskOffset + payloadLength)
			return null;

		const payload = Buffer.from(
			this.buffer.subarray(
				offset + maskOffset,
				offset + maskOffset + payloadLength,
			),
		);
		if (masked) {
			const mask = this.buffer.subarray(offset, offset + 4);
			for (let i = 0; i < payload.byteLength; i++) {
				payload[i] = payload[i] ^ mask[i % 4];
			}
		}
		this.buffer = this.buffer.subarray(offset + maskOffset + payloadLength);
		return { opcode, payload, compressed };
	}
}

function openWebSocket(
	port: number,
	path = "/ws",
	options: { method?: string; subprotocol?: string; extensions?: string } = {},
): Promise<{ client: TestClient; status: number; headers: Record<string, string> }> {
	return new Promise((resolve, reject) => {
		const socket = netConnect({ port });
		const client = new TestClient(socket);
		client.on("error", reject);
		client.open(path, options).then(({ status, headers }) =>
			resolve({ client, status, headers }),
		);
	});
}

function waitFor(assertion: () => void, timeout = 2000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			try {
				assertion();
				resolve();
			} catch (error) {
				if (Date.now() - start > timeout) {
					reject(error);
					return;
				}
				setTimeout(check, 10);
			}
		};
		check();
	});
}

afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

describe("WebSocket handshake options", () => {
	it("rejects clients rejected by verifyClient with a 401", async () => {
		const server = new Server({
			websocket: { verifyClient: () => false },
		});
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { status } = await openWebSocket(port, "/ws");

		expect(status).toBe(401);
	});

	it("rejects with a custom status, message and headers from verifyClient", async () => {
		const server = new Server({
			websocket: {
				verifyClient: () => ({
					ok: false,
					status: 403,
					message: "Forbidden realm",
					headers: { "x-reason": "blacklisted" },
				}),
			},
		});
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { status, headers } = await openWebSocket(port, "/ws");

		expect(status).toBe(403);
		expect(headers["x-reason"]).toBe("blacklisted");
	});

	it("runs async verifyClient before upgrading", async () => {
		const server = new Server({
			websocket: {
				verifyClient: async () => {
					await new Promise((r) => setTimeout(r, 5));
					return true;
				},
			},
		});
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { status } = await openWebSocket(port, "/ws");

		expect(status).toBe(101);
	});

	it("selects a subprotocol via handleProtocols", async () => {
		const server = new Server({
			websocket: {
				handleProtocols: (protocols) =>
					protocols.has("graphql-ws") ? "graphql-ws" : false,
			},
		});
		server.ws("/ws", ({ socket }) => {
			socket.on("text", () => socket.send(socket.protocol));
		});
		const port = await listen(server);

		const { client, status, headers } = await openWebSocket(port, "/ws", {
			subprotocol: "graphql-ws, chat",
		});

		expect(status).toBe(101);
		expect(headers["sec-websocket-protocol"]).toBe("graphql-ws");

		const received: string[] = [];
		client.on("text", (p) => received.push(String(p)));
		client.sendText("x");
		await waitFor(() => expect(received).toEqual(["graphql-ws"]));
	});

	it("appends static headers to the 101 response", async () => {
		const server = new Server({
			websocket: { headers: { "x-server": "panmdaa" } },
		});
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { status, headers } = await openWebSocket(port, "/ws");

		expect(status).toBe(101);
		expect(headers["x-server"]).toBe("panmdaa");
	});

	it("computes the expected Sec-WebSocket-Accept", async () => {
		const server = new Server();
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { headers } = await openWebSocket(port, "/ws");

		const expected = createHash("sha1")
			.update("dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
			.digest("base64");
		expect(headers["sec-websocket-accept"]).toBe(expected);
	});
});

describe("WebSocket frame + connection behavior", () => {
	it("closes with a custom code and reason", async () => {
		const server = new Server();
		server.ws("/ws", ({ socket }) => {
			socket.on("text", () => socket.close(1001, "going away"));
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const closed: Array<{ code: number; reason: string }> = [];
		client.on("close", (payload) => {
			if (payload) {
				closed.push({
					code: (payload as Buffer).readUInt16BE(0),
					reason: (payload as Buffer).subarray(2).toString("utf8"),
				});
			}
		});
		client.sendText("bye");
		await waitFor(() => expect(closed.length).toBe(1));
		expect(closed[0].code).toBe(1001);
		expect(closed[0].reason).toBe("going away");
	});

	it("terminates the connection", async () => {
		const server = new Server();
		server.ws("/ws", ({ socket }) => {
			socket.on("text", () => socket.terminate());
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		let clientClosed = false;
		client.on("close", () => {
			clientClosed = true;
		});
		client.sendText("kill");
		await waitFor(() => expect(clientClosed).toBe(true));
	});

	it("echoes pong frames with payload", async () => {
		const server = new Server();
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const pongs: Buffer[] = [];
		client.on("pong", (p) => pongs.push(p as Buffer));
		client.ping(Buffer.from("heartbeat"));
		await waitFor(() => expect(pongs.length).toBe(1));
		expect(pongs[0]).toEqual(Buffer.from("heartbeat"));
	});

	it("exposes the negotiated extension as permessage-deflate", async () => {
		const server = new Server({
			websocket: { perMessageDeflate: true },
		});
		server.ws("/ws", ({ socket }) => {
			socket.send(JSON.stringify(socket.extensions));
		});
		const port = await listen(server);

		const { client, headers } = await openWebSocket(port, "/ws", {
			extensions: "permessage-deflate",
		});
		expect(headers["sec-websocket-extensions"]).toContain("permessage-deflate");

		const received: string[] = [];
		client.on("text", (p) => received.push(String(p)));
		await waitFor(() => expect(received.length).toBe(1));
		expect(JSON.parse(received[0])).toEqual({ permessageDeflate: true });
	});

	it("round-trips compressed messages over permessage-deflate", async () => {
		const server = new Server({
			websocket: { perMessageDeflate: { threshold: 1 } },
		});
		server.ws("/ws", ({ socket }) => {
			socket.on("message", ({ data }) => socket.send(data));
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws", {
			extensions: "permessage-deflate",
		});
		const received: Buffer[] = [];
		client.on("binary", (p) => received.push(p as Buffer));
		const payload = Buffer.from("compress me please compress me please");
		client.sendBinary(payload);
		await waitFor(() => expect(received.length).toBe(1));
		expect(received[0]).toEqual(payload);
	});

	it("closes with 1009 when a message exceeds maxPayload", async () => {
		const server = new Server({ websocket: { maxPayload: 32 } });
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const closed: number[] = [];
		client.on("close", (p) => {
			if (p) closed.push((p as Buffer).readUInt16BE(0));
		});
		client.sendText("x".repeat(200));
		await waitFor(() => expect(closed.length).toBe(1));
		expect(closed[0]).toBe(1009);
	});

	it("accepts invalid UTF-8 when validation is skipped", async () => {
		const server = new Server({ websocket: { skipUTF8Validation: true } });
		server.ws("/ws", ({ socket }) => {
			socket.on("message", ({ data }) => socket.send(data));
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const received: string[] = [];
		client.on("text", (p) => received.push(String(p)));
		client.sendText("\xff\xfe invalid utf8");
		await waitFor(() => expect(received.length).toBe(1));
	});
});

describe("WebSocket heartbeat", () => {
	it("closes a tracked socket that never answers pings", async () => {
		const server = new Server();
		const heartbeat = createWebSocketHeartbeat({
			intervalMs: 20,
			timeoutMs: 5,
			closeCode: 1001,
			closeReason: "Heartbeat timeout",
		});
		server.ws("/ws", ({ socket }) => {
			heartbeat.track(socket);
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const closed: number[] = [];
		client.on("close", (p) => {
			if (p) closed.push((p as Buffer).readUInt16BE(0));
		});
		await waitFor(() => expect(closed.length).toBe(1));
		expect(closed[0]).toBe(1001);
		heartbeat.close();
	});

	it("keeps a socket alive while it answers pings", async () => {
		const server = new Server();
		const heartbeat = createWebSocketHeartbeat({
			intervalMs: 20,
			timeoutMs: 15,
		});
		server.ws("/ws", ({ socket }) => {
			heartbeat.track(socket);
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");

		// Answer server pings so the sweeper never closes the socket.
		client.on("ping", () => client.pong());
		await new Promise((r) => setTimeout(r, 60));

		let closed = false;
		client.on("close", () => {
			closed = true;
		});
		expect(closed).toBe(false);

		client.sendClose(1000);
		await waitFor(() => expect(closed).toBe(true));
		heartbeat.close();
	});
});
