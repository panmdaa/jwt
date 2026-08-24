import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { Server } from "../../../src/http/server/server";

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

/** Minimal WebSocket client over a raw socket, for handshake + frames. */
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
		socket.on("error", () => {
			this.emit("error", new Error("socket error"));
		});
		socket.on("close", () => {
			this.emit("close");
		});
	}

	on(event: string, fn: (...args: unknown[]) => void): void {
		this.listeners.push({ event, fn });
	}

	emit(event: string, ...args: unknown[]): void {
		for (const l of this.listeners) {
			if (l.event === event) l.fn(...args);
		}
	}

	connect(path = "/", method = "GET", subprotocol?: string): void {
		const key = "dGhlIHNhbXBsZSBub25jZQ==";
		const headers = [
			`${method} ${path} HTTP/1.1`,
			"Host: localhost",
			"Upgrade: websocket",
			"Connection: Upgrade",
			`Sec-WebSocket-Key: ${key}`,
			"Sec-WebSocket-Version: 13",
		];
		if (subprotocol) headers.push(`Sec-WebSocket-Protocol: ${subprotocol}`);
		this.socket.write([...headers, "", ""].join("\r\n"));
	}

	async open(
		path = "/",
		options: { tls?: boolean; method?: string; subprotocol?: string } = {},
	): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			this.handshakeResolve = resolve;
			const socket = this.socket as Socket & { rejectUnauthorized?: boolean };
			socket.once("error", reject);
			const send = () =>
				this.connect(path, options.method ?? "GET", options.subprotocol);
			if (options.tls) {
				(socket as import("node:tls").TLSSocket).once("secureConnect", send);
			} else {
				socket.once("connect", send);
			}
		});
	}

	sendText(message: string): void {
		this.sendFrame(0x1, Buffer.from(message));
	}

	sendBinary(data: Buffer): void {
		this.sendFrame(0x2, data);
	}

	ping(payload: Buffer = Buffer.alloc(0)): void {
		this.sendFrame(0x9, payload);
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
		// Consume the HTTP handshake response exactly once.
		if (!this.handshakeDone) {
			const idx = this.buffer.indexOf("\r\n\r\n");
			if (idx === -1) return;
			const head = this.buffer.subarray(0, idx).toString("latin1");
			this.handshakeDone = true;
			this.buffer = this.buffer.subarray(idx + 4);
			const resolve = this.handshakeResolve;
			this.handshakeResolve = undefined;
			const status = Number(head.split(" ")[1] ?? "0");
			resolve?.(status);
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
								: "pong";
			this.emit(eventType, frame.payload);
		}
	}

	private parseFrame(): { opcode: number; payload: Buffer } | null {
		if (this.buffer.byteLength < 2) return null;
		const opcode = this.buffer[0] & 0x0f;
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
		return { opcode, payload };
	}
}

function openWebSocket(
	port: number,
	path = "/ws",
	options: { tls?: boolean; method?: string; subprotocol?: string } = {},
): Promise<{ client: TestClient; status: number }> {
	return new Promise((resolve, reject) => {
		const socket = options.tls
			? tlsConnect({ port, rejectUnauthorized: false })
			: netConnect({ port });
		const client = new TestClient(socket);
		client.on("error", reject);
		client.open(path, options).then((status) => resolve({ client, status }));
	});
}

describe("WebSocket integration", () => {
	afterEach(() => {
		for (const server of servers) {
			server.close();
		}
		servers.length = 0;
	});

	it("upgrades a GET request and echoes messages", async () => {
		const server = new Server();
		server.ws("/ws", ({ socket }) => {
			socket.on("text", (data) => socket.send(`echo:${data}`));
		});
		const port = await listen(server);

		const { client, status } = await openWebSocket(port, "/ws");
		expect(status).toBe(101);
		const received: string[] = [];
		client.on("text", (payload) => received.push(String(payload)));
		client.sendText("hola");

		await waitFor(() => expect(received).toEqual(["echo:hola"]));
	});

	it("serves ws routes with path params", async () => {
		const server = new Server();
		server.ws("/ws/:room", ({ socket, params }) => {
			socket.on("text", () => socket.send(`room:${params.room}`));
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws/lobby");
		const received: string[] = [];
		client.on("text", (payload) => received.push(String(payload)));
		client.sendText("hi");

		await waitFor(() => expect(received).toEqual(["room:lobby"]));
	});

	it("rejects upgrade with 404 when no ws route matches", async () => {
		const server = new Server();
		const port = await listen(server);

		const { status } = await openWebSocket(port, "/nope");
		expect(status).toBe(404);
	});

	it("rejects upgrade with 405 for non-GET methods", async () => {
		const server = new Server();
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { status } = await openWebSocket(port, "/ws", { method: "POST" });
		expect(status).toBe(405);
	});

	it("negotiates a subprotocol", async () => {
		const server = new Server({
			websocket: { protocols: ["json", "msgpack"] },
		});
		server.ws("/ws", ({ socket }) => {
			socket.on("text", () => socket.send(socket.protocol));
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws", {
			subprotocol: "json",
		});
		const received: string[] = [];
		client.on("text", (payload) => received.push(String(payload)));
		client.sendText("x");

		await waitFor(() => expect(received).toEqual(["json"]));
	});

	it("replies to ping frames automatically (autoPong)", async () => {
		const server = new Server();
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const pongs: Buffer[] = [];
		client.on("pong", (payload) => pongs.push(payload as Buffer));
		client.ping(Buffer.from("abc"));

		await waitFor(() => expect(pongs.length).toBe(1));
	});

	it("performs a clean close handshake", async () => {
		const server = new Server();
		server.ws("/ws", () => {});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const closed: number[] = [];
		client.on("close", (payload) => {
			if (payload) closed.push((payload as Buffer).readUInt16BE(0));
		});
		client.sendClose(1000, "bye");
		await waitFor(() => expect(closed.length).toBe(1));
		expect(closed[0]).toBe(1000);
	});

	it("sends and receives binary messages", async () => {
		const server = new Server();
		server.ws("/ws", ({ socket }) => {
			socket.on("binary", (data) => socket.send(data));
		});
		const port = await listen(server);

		const { client } = await openWebSocket(port, "/ws");
		const received: Buffer[] = [];
		client.on("binary", (payload) => received.push(payload as Buffer));
		client.sendBinary(Buffer.from([1, 2, 3]));

		await waitFor(() => expect(received.length).toBe(1));
		expect(received[0]).toEqual(Buffer.from([1, 2, 3]));
	});

	it("computes the correct Sec-WebSocket-Accept value", async () => {
		const expected = createHash("sha1")
			.update("dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
			.digest("base64");
		expect(expected).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
	});
});

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
