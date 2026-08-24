import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { upgradeWebSocket } from "../../src/ws/handshake";
import type {
	NodeUpgradeSocket,
	ResolvedWebSocketRoute,
	WebSocketRequest,
} from "../../src/ws/types";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const VALID_KEY = "dGhlIHNhbXBsZSBub25jZQ==";

class MockUpgradeSocket extends EventEmitter {
	writable = true;
	bytesWritten = 0;
	destroyed = false;
	written: Buffer[] = [];
	unshifted: Buffer[] = [];

	write(
		chunk: Buffer | string,
		cb?: (error?: Error | null) => void,
	): boolean {
		const buffer = Buffer.from(chunk);
		this.written.push(buffer);
		this.bytesWritten += buffer.byteLength;
		cb?.(null);
		return true;
	}

	end(chunk?: Buffer | string): void {
		if (chunk) {
			const buffer = Buffer.from(chunk);
			this.written.push(buffer);
			this.bytesWritten += buffer.byteLength;
		}
	}

	destroy(): void {
		if (!this.destroyed) {
			this.destroyed = true;
			this.emit("close");
		}
	}

	unshift(chunk: Buffer): void {
		this.unshifted.push(Buffer.from(chunk));
	}

	setNoDelay(): void {}
	cork(): void {}
	uncork(): void {}
	pause(): void {}
	resume(): void {}
	setTimeout(): void {}
}

function makeRequest(overrides: Partial<WebSocketRequest> = {}): WebSocketRequest {
	const headers: Record<string, string> = {
		upgrade: "websocket",
		connection: "Upgrade",
		"sec-websocket-key": VALID_KEY,
		"sec-websocket-version": "13",
		...((overrides.headers as Record<string, string>) ?? {}),
	};

	return {
		method: "GET",
		url: "/ws",
		get(name: string): string | undefined {
			return headers[name.toLowerCase()];
		},
		headers: headers as never,
		...overrides,
	};
}

function makeRoute(
	overrides: Partial<ResolvedWebSocketRoute> = {},
): ResolvedWebSocketRoute {
	return {
		handler: () => {},
		options: {},
		params: {},
		search: "",
		...overrides,
	};
}

function parseResponse(buffer: Buffer): {
	status: number;
	headers: Record<string, string>;
} {
	const text = buffer.toString("latin1");
	const [statusLine, ...headerLines] = text.split("\r\n");
	const headers: Record<string, string> = {};
	for (const line of headerLines) {
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		headers[line.slice(0, colon).trim().toLowerCase()] = line
			.slice(colon + 1)
			.trim();
	}
	return { status: Number(statusLine.split(" ")[1] ?? 0), headers };
}

describe("upgradeWebSocket validations", () => {
	it("rejects non-GET requests with 405", async () => {
		const socket = new MockUpgradeSocket();
		const request = makeRequest({ method: "POST" });

		const result = await upgradeWebSocket(
			request,
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(result).toBeUndefined();
		const { status } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(405);
	});

	it("rejects a missing or wrong Upgrade header with 400", async () => {
		const socket = new MockUpgradeSocket();
		const request = makeRequest({ headers: { upgrade: "h2c" } as never });

		const result = await upgradeWebSocket(
			request,
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(result).toBeUndefined();
		const { status } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(400);
	});

	it("rejects a Connection header without the upgrade token with 400", async () => {
		const socket = new MockUpgradeSocket();
		const request = makeRequest({
			headers: { connection: "keep-alive" } as never,
		});

		const result = await upgradeWebSocket(
			request,
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(result).toBeUndefined();
		const { status } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(400);
	});

	it("accepts a Connection header listing upgrade among other tokens", async () => {
		const socket = new MockUpgradeSocket();
		const request = makeRequest({
			headers: { connection: "keep-alive, Upgrade" } as never,
		});

		const result = await upgradeWebSocket(
			request,
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(result).toBeDefined();
	});

	it("rejects a missing or malformed Sec-WebSocket-Key with 400", async () => {
		const socket = new MockUpgradeSocket();
		const request = makeRequest({
			headers: { "sec-websocket-key": "short" } as never,
		});

		const result = await upgradeWebSocket(
			request,
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(result).toBeUndefined();
		const { status } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(400);
	});

	it("rejects a version other than 13 with a Version hint header", async () => {
		const socket = new MockUpgradeSocket();
		const request = makeRequest({
			headers: { "sec-websocket-version": "12" } as never,
		});

		const result = await upgradeWebSocket(
			request,
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(result).toBeUndefined();
		const { status, headers } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(400);
		expect(headers["sec-websocket-version"]).toBe("13");
	});

	it("destroys the socket on rejection when it is not writable", async () => {
		const socket = new MockUpgradeSocket();
		socket.writable = false;
		const destroy = vi.spyOn(socket, "destroy");

		await upgradeWebSocket(
			makeRequest({ method: "PUT" }),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(destroy).toHaveBeenCalled();
	});
});

describe("upgradeWebSocket success", () => {
	it("responds 101 with the RFC 6455 accept key", async () => {
		const socket = new MockUpgradeSocket();

		const connection = await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		expect(connection).toBeDefined();
		const { status, headers } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(101);
		expect(headers["sec-websocket-accept"]).toBe(
			createHash("sha1").update(VALID_KEY + GUID).digest("base64"),
		);
		expect(headers.upgrade).toBe("websocket");
		expect(headers.connection).toBe("Upgrade");
	});

	it("unshifts leftover head bytes back to the socket", async () => {
		const socket = new MockUpgradeSocket();
		const head = Buffer.from("leftover-frame-bytes");

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			head,
			makeRoute(),
		);

		expect(socket.unshifted[0]).toEqual(head);
	});

	it("negotiates the first server-declared protocol the client offered", async () => {
		const socket = new MockUpgradeSocket();

		const connection = await upgradeWebSocket(
			makeRequest({
				headers: { "sec-websocket-protocol": "superchat, chat" } as never,
			}),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { protocols: ["chat", "superchat"] } }),
		);

		const { headers } = parseResponse(Buffer.concat(socket.written));
		expect(headers["sec-websocket-protocol"]).toBe("chat");
		expect(connection?.protocol).toBe("chat");
	});

	it("falls back to the client's first offered protocol when no list is configured", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest({
				headers: { "sec-websocket-protocol": "p1, p2" } as never,
			}),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute(),
		);

		const { headers } = parseResponse(Buffer.concat(socket.written));
		expect(headers["sec-websocket-protocol"]).toBe("p1");
	});

	it("honours a custom handleProtocols implementation", async () => {
		const socket = new MockUpgradeSocket();
		const handleProtocols = (protocols: ReadonlySet<string>) =>
			protocols.has("p2") ? "p2" : undefined;

		const connection = await upgradeWebSocket(
			makeRequest({
				headers: { "sec-websocket-protocol": "p1, p2" } as never,
			}),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { handleProtocols } }),
		);

		expect(connection?.protocol).toBe("p2");
	});

	it("throws when handleProtocols selects a protocol the client did not offer", async () => {
		const socket = new MockUpgradeSocket();

		await expect(
			upgradeWebSocket(
				makeRequest({
					headers: { "sec-websocket-protocol": "p1" } as never,
				}),
				socket as unknown as NodeUpgradeSocket,
				Buffer.alloc(0),
				makeRoute({ options: { handleProtocols: () => "p-other" } }),
			),
		).rejects.toThrow(
			'Selected WebSocket protocol "p-other" was not requested by the client',
		);
	});

	it("omits the protocol header when the client offered none", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { protocols: ["chat"] } }),
		);

		const { headers } = parseResponse(Buffer.concat(socket.written));
		expect(headers["sec-websocket-protocol"]).toBeUndefined();
	});

	it("applies static extra headers to the 101 response", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { headers: { "x-trace": "abc" } } }),
		);

		const { headers } = parseResponse(Buffer.concat(socket.written));
		expect(headers["x-trace"]).toBe("abc");
	});

	it("applies a headers callback to the 101 response", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { headers: () => ({ "x-dynamic": "yes" }) } }),
		);

		const { headers } = parseResponse(Buffer.concat(socket.written));
		expect(headers["x-dynamic"]).toBe("yes");
	});

	it("drops header names and values that could smuggle CRLF", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({
				options: {
					headers: { "x-bad-name": "ok", "x-ok": "v\r\nInjected: yes" },
				},
			}),
		);

		const response = Buffer.concat(socket.written).toString("latin1");
		expect(response).not.toContain("Injected");
	});
});

describe("upgradeWebSocket verifyClient", () => {
	it("rejects the upgrade when verifyClient returns false", async () => {
		const socket = new MockUpgradeSocket();
		const verifyClient = vi.fn(() => ({ ok: false, status: 403 }));

		const result = await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { verifyClient } }),
		);

		expect(result).toBeUndefined();
		expect(verifyClient).toHaveBeenCalledTimes(1);
		const { status } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(403);
	});

	it("supports an async verifyClient", async () => {
		const socket = new MockUpgradeSocket();
		const verifyClient = vi.fn(async () => false);

		const result = await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({ options: { verifyClient } }),
		);

		expect(result).toBeUndefined();
		const { status } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(401);
	});

	it("passes extra headers from a rejected verifyClient", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({
				options: {
					verifyClient: () => ({
						ok: false,
						status: 401,
						message: "denied",
						headers: { "www-authenticate": "Bearer" },
					}),
				},
			}),
		);

		const { status, headers } = parseResponse(Buffer.concat(socket.written));
		expect(status).toBe(401);
		expect(headers["www-authenticate"]).toBe("Bearer");
	});

	it("rejects an invalid Sec-WebSocket-Protocol header token", async () => {
		const socket = new MockUpgradeSocket();

		await expect(
			upgradeWebSocket(
				makeRequest({
					headers: { "sec-websocket-protocol": "bad proto!" } as never,
				}),
				socket as unknown as NodeUpgradeSocket,
				Buffer.alloc(0),
				makeRoute(),
			),
		).rejects.toThrow("Invalid Sec-WebSocket-Protocol header");
	});

	it("sanitizes rejected-verifyClient headers against CRLF injection", async () => {
		const socket = new MockUpgradeSocket();

		await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({
				options: {
					verifyClient: () => ({
						ok: false,
						status: 401,
						headers: { "x-v": "a\r\nb" },
					}),
				},
			}),
		);

		const response = Buffer.concat(socket.written).toString("latin1");
		expect(response).not.toContain("\r\nb");
	});
});

describe("upgradeWebSocket option plumbing", () => {
	it("propagates autoPong, maxPayload and skipUTF8Validation to the connection", async () => {
		const socket = new MockUpgradeSocket();

		const connection = await upgradeWebSocket(
			makeRequest(),
			socket as unknown as NodeUpgradeSocket,
			Buffer.alloc(0),
			makeRoute({
				options: {
					autoPong: false,
					maxPayload: "1kb",
					skipUTF8Validation: true,
				},
			}),
		);

		expect(connection).toBeDefined();
		expect(connection?.protocol).toBe("");

		// autoPong:false must NOT answer pings.
		const pingFrame = Buffer.from([0x89, 0x80, 0x01, 0x02, 0x03, 0x04]);
		const wroteAfterPing = socket.written.length;
		socket.emit("data", pingFrame);
		expect(socket.written.length).toBe(wroteAfterPing);

		// skipUTF8Validation:true must not reject invalid UTF-8 payloads.
		const invalidText = Buffer.from([0x81, 0x83, 0x01, 0x02, 0x03, 0x04, 0xff, 0xfe, 0x41]);
		let errored = false;
		connection?.on("error", () => {
			errored = true;
		});
		socket.emit("data", invalidText);
		expect(errored).toBe(false);
	});
});