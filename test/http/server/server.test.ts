import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { type ClientHttp2Session, connect as http2Connect } from "node:http2";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequest } from "../../../src/error/errors";
import { Server } from "../../../src/http/server/server";

const fixtures = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"fixtures",
);

const key = readFileSync(join(fixtures, "key.pem"), "utf8");
const cert = readFileSync(join(fixtures, "cert.pem"), "utf8");

const servers: Server[] = [];

function listen(server: Server): Promise<number> {
	servers.push(server);
	return new Promise((resolve) => {
		server.listen(0);
		server.address;
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

function httpGet(
	port: number,
	path: string,
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest({ port, path, method: "GET" }, (res) => {
			const chunks: string[] = [];
			res.on("data", (chunk) => chunks.push(String(chunk)));
			res.on("end", () =>
				resolve({ status: res.statusCode ?? 0, body: chunks.join("") }),
			);
		});
		req.on("error", reject);
		req.end();
	});
}

function httpSend(
	port: number,
	path: string,
	method: string,
	body?: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest({ port, path, method }, (res) => {
			const chunks: string[] = [];
			res.on("data", (chunk) => chunks.push(String(chunk)));
			res.on("end", () =>
				resolve({
					status: res.statusCode ?? 0,
					body: chunks.join(""),
					headers: res.headers as Record<string, string>,
				}),
			);
		});
		req.on("error", reject);
		if (body) req.write(body);
		req.end();
	});
}

function httpsGet(
	port: number,
	path: string,
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = httpsRequest(
			{ port, path, method: "GET", rejectUnauthorized: false },
			(res) => {
				const chunks: string[] = [];
				res.on("data", (chunk) => chunks.push(String(chunk)));
				res.on("end", () =>
					resolve({ status: res.statusCode ?? 0, body: chunks.join("") }),
				);
			},
		);
		req.on("error", reject);
		req.end();
	});
}

async function connectHttp2(
	port: number,
	secure = true,
): Promise<ClientHttp2Session> {
	const scheme = secure ? "https" : "http";
	const session = http2Connect(`${scheme}://localhost:${port}`, {
		rejectUnauthorized: false,
	});
	await new Promise<void>((resolve, reject) => {
		session.once("connect", resolve);
		session.once("error", reject);
	});
	return session;
}

function http2Get(
	session: ClientHttp2Session,
	path: string,
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = session.request({ ":path": path, ":method": "GET" });
		const chunks: string[] = [];
		req.on("response", (headers) => {
			req.on("data", (chunk) => chunks.push(String(chunk)));
			req.on("end", () =>
				resolve({
					status: (headers[":status"] as number) ?? 0,
					body: chunks.join(""),
				}),
			);
		});
		req.on("error", reject);
		req.end();
	});
}

afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

describe("Server over HTTP/1.1", () => {
	it("serves a GET route", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("hi"));
		const port = await listen(server);

		const { status, body } = await httpGet(port, "/hello");

		expect(status).toBe(200);
		expect(body).toBe("hi");
	});

	it("returns 404 for unknown routes", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("hi"));
		const port = await listen(server);

		const { status, body } = await httpGet(port, "/nope");

		expect(status).toBe(404);
		expect(JSON.parse(body)).toEqual({ status: 404, message: "Not Found" });
	});

	it("returns 405 with an Allow header when the method is not registered", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("hi"));
		const port = await listen(server);

		const { status, body, headers } = await httpSend(port, "/hello", "POST");

		expect(status).toBe(405);
		expect(JSON.parse(body)).toEqual({
			status: 405,
			message: "Method Not Allowed",
		});
		expect(headers.allow).toBe("GET");
	});

	it("overwrites the default 405 when the method is registered", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("get"));
		server.post("/hello", ({ response }) => response.text("post"));
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/hello", "POST");

		expect(status).toBe(200);
		expect(body).toBe("post");
	});

	it("serves HEAD requests via the GET handler", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("hi"));
		const port = await listen(server);

		const { status } = await httpSend(port, "/hello", "HEAD");

		expect(status).toBe(200);
	});

	it("replies 200 with Allow to OPTIONS when no handler is registered", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("hi"));
		const port = await listen(server);

		const { status, headers } = await httpSend(port, "/hello", "OPTIONS");

		expect(status).toBe(200);
		expect(headers.allow).toBe("GET");
	});

	it("honours an explicit OPTIONS handler over the default reply", async () => {
		const server = new Server();
		server.get("/hello", ({ response }) => response.text("hi"));
		server.options("/hello", ({ response }) => response.text("custom"));
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/hello", "OPTIONS");

		expect(status).toBe(200);
		expect(body).toBe("custom");
	});

	it("replies with the status and message of a thrown HttpError", async () => {
		const server = new Server();
		server.get("/error", () => {
			throw new BadRequest("Invalid request");
		});
		const port = await listen(server);

		const { status, body } = await httpGet(port, "/error");

		expect(status).toBe(400);
		expect(JSON.parse(body)).toEqual({
			status: 400,
			message: "Invalid request",
		});
	});

	it("includes the description in the JSON error body", async () => {
		const server = new Server();
		server.get("/error", () => {
			throw new BadRequest("Invalid request", "The id field must be a number");
		});
		const port = await listen(server);

		const { status, body } = await httpGet(port, "/error");

		expect(status).toBe(400);
		expect(JSON.parse(body)).toEqual({
			status: 400,
			message: "Invalid request",
			description: "The id field must be a number",
		});
	});

	it("omits description when the HttpError has none", async () => {
		const server = new Server();
		server.get("/error", () => {
			throw new BadRequest();
		});
		const port = await listen(server);

		const { status, body } = await httpGet(port, "/error");

		expect(status).toBe(400);
		expect(JSON.parse(body)).toEqual({
			status: 400,
			message: "Bad Request",
		});
	});

	it("replies 413 when the body exceeds maxBodySize", async () => {
		const server = new Server({ maxBodySize: 10 });
		server.post("/upload", ({ body }) => body.raw());
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/upload",
			"POST",
			"x".repeat(50),
		);

		expect(status).toBe(413);
		expect(JSON.parse(body)).toEqual({
			status: 413,
			message: "Request body exceeds the 10 byte limit",
		});
	});

	it("replies 500 with a generic message for unknown errors", async () => {
		const server = new Server();
		server.get("/boom", () => {
			throw new Error("boom");
		});
		const port = await listen(server);

		const { status, body } = await httpGet(port, "/boom");

		expect(status).toBe(500);
		expect(JSON.parse(body)).toEqual({
			status: 500,
			message: "Internal Server Error",
		});
	});

	it("does not write a second response after headers were committed", async () => {
		const onError = vi.fn();
		const server = new Server({ onError });

		server.get("/sse", async ({ response }) => {
			const failing = new Readable({
				read() {
					this.destroy(new Error("stream blew up"));
				},
			});
			await response.stream(failing);
		});

		const port = await listen(server);

		// The stream commits headers (200) and then destroys the socket, so the
		// client sees a hang up rather than a status. The important part is that
		// the server never tries to set headers on the committed response.
		await expect(httpSend(port, "/sse", "GET")).rejects.toThrow(
			"socket hang up",
		);

		expect(onError).toHaveBeenCalledWith(expect.any(Error));
	});
});

describe("Server over HTTPS", () => {
	it("serves a GET route over TLS", async () => {
		const server = new Server({ tls: { key, cert } });
		server.get("/secure", ({ response }) => response.text("tls!"));
		const port = await listen(server);

		const { status, body } = await httpsGet(port, "/secure");

		expect(status).toBe(200);
		expect(body).toBe("tls!");
	});
});

describe("Server over HTTP/2", () => {
	it("serves a GET route over cleartext http2 (h2c)", async () => {
		const server = new Server({ http2: true });
		server.get("/h2", ({ response }) => response.text("h2c!"));
		const port = await listen(server);

		const session = await connectHttp2(port, false);
		try {
			const { status, body } = await http2Get(session, "/h2");
			expect(status).toBe(200);
			expect(body).toBe("h2c!");
		} finally {
			session.close();
		}
	});
});

describe("Server over HTTPS + HTTP/2", () => {
	it("negotiates h2 for http2 clients", async () => {
		const server = new Server({ http2: true, tls: { key, cert } });
		server.get("/both", ({ response }) => response.text("h2 over tls"));
		const port = await listen(server);

		const session = await connectHttp2(port);
		try {
			const { status, body } = await http2Get(session, "/both");
			expect(status).toBe(200);
			expect(body).toBe("h2 over tls");
		} finally {
			session.close();
		}
	});

	it("falls back to HTTP/1.1 over TLS via ALPN", async () => {
		const server = new Server({ http2: true, tls: { key, cert } });
		server.get("/both", ({ response }) => response.text("h1 via alpn"));
		const port = await listen(server);

		const { status, body } = await httpsGet(port, "/both");

		expect(status).toBe(200);
		expect(body).toBe("h1 via alpn");
	});
});
