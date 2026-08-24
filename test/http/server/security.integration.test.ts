import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function httpSend(
	port: number,
	path: string,
	method = "GET",
	body?: string | Buffer,
	headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest(
			{ port, path, method, headers },
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString("utf8"),
					}),
				);
			},
		);
		req.on("error", reject);
		if (body) req.write(body);
		req.end();
	});
}

afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

describe("HTTP request security", () => {
	it("rejects unknown routes with a structured 404", async () => {
		const server = new Server();
		server.get("/known", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/does-not-exist");

		expect(status).toBe(404);
		expect(JSON.parse(body)).toEqual({
			status: 404,
			message: "Not Found",
		});
	});

	it("rejects an unsupported method on a known route with 405", async () => {
		const server = new Server();
		server.post("/echo", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { status } = await httpSend(port, "/echo", "DELETE");

		expect(status).toBe(405);
	});

	it("keeps percent-encoded path params raw (no double-decode surprises)", async () => {
		const server = new Server();
		server.get("/files/:name", ({ params, response }) => response.json(params));
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/files/a%2Fb.txt");

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ name: "a%2Fb.txt" });
	});

	it("rejects path traversal and double-slash shapes", async () => {
		const server = new Server();
		server.get("/files/:name", ({ params, response }) => response.json(params));
		const port = await listen(server);

		// Percent-encoded traversal stays raw in params (never decoded).
		const { status: encoded, body: encodedBody } = await httpSend(
			port,
			"/files/..%2Fetc%2Fpasswd",
		);
		expect(encoded).toBe(200);
		expect(JSON.parse(encodedBody)).toEqual({ name: "..%2Fetc%2Fpasswd" });

		const { status: double } = await httpSend(port, "/files//etc/passwd");
		const { status: dotdot } = await httpSend(port, "/files/../secret");

		expect(double).toBe(404);
		expect(dotdot).toBe(404);
	});

	it("keeps __proto__ and constructor as plain query keys without polluting Object.prototype", async () => {
		const server = new Server();
		server.get("/files/:name", ({ query, response }) => response.json(query));
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/files/x.txt?__proto__=evil&constructor=bad",
		);

		expect(status).toBe(200);
		const query = JSON.parse(body) as Record<string, string>;
		// biome-ignore lint/suspicious/noProto: asserting __proto__ arrives as a plain key
		expect(query["__proto__"]).toBe("evil");
		expect(query["constructor"]).toBe("bad");
		// The query object itself must not be a prototype-polluted object.
		expect(Object.getPrototypeOf(query)).toBe(Object.prototype);
		expect(({} as Record<string, unknown>).evil).toBeUndefined();
	});

	it("returns 500 without crashing on a malformed JSON body", async () => {
		const server = new Server();
		server.post("/echo", async ({ body, response }) => {
			response.json(await body.json());
		});
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/echo", "POST", "{nope", {
			"content-type": "application/json",
		});

		expect(status).toBe(500);
		expect(JSON.parse(body)).toEqual({
			status: 500,
			message: "Internal Server Error",
		});
	});

	it("returns 413 when the body exceeds maxBodySize while being read", async () => {
		const server = new Server({ maxBodySize: 16 });
		server.post("/upload", async ({ body, response }) => {
			await body.raw();
			response.text("ok");
		});
		const port = await listen(server);

		const { status } = await httpSend(
			port,
			"/upload",
			"POST",
			Buffer.alloc(1024, 0x61),
		);

		expect(status).toBe(413);
	});

	it("accepts a body right at maxBodySize", async () => {
		const server = new Server({ maxBodySize: 16 });
		server.post("/upload", async ({ body, response }) => {
			await body.raw();
			response.text("ok");
		});
		const port = await listen(server);

		const { status } = await httpSend(
			port,
			"/upload",
			"POST",
			Buffer.alloc(16, 0x61),
		);

		expect(status).toBe(200);
	});

	it("invokes onError when a handler throws", async () => {
		const onError = vi.fn();
		const server = new Server({ onError });
		server.get("/boom", () => {
			throw new Error("kaboom");
		});
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/boom");

		expect(status).toBe(500);
		expect(JSON.parse(body)).toEqual({
			status: 500,
			message: "Internal Server Error",
		});
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "kaboom" }),
		);
	});

	it("returns 500 without crashing on an async handler rejection", async () => {
		const server = new Server();
		server.get("/reject", async () => {
			throw new Error("async boom");
		});
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/reject");

		expect(status).toBe(500);
		expect(JSON.parse(body)).toEqual({
			status: 500,
			message: "Internal Server Error",
		});
	});

	it("serves the next valid request after a handler error (no crashed state)", async () => {
		const server = new Server();
		server.get("/boom", () => {
			throw new Error("kaboom");
		});
		server.get("/fine", ({ response }) => response.text("fine"));
		const port = await listen(server);

		await httpSend(port, "/boom");
		const { status, body } = await httpSend(port, "/fine");

		expect(status).toBe(200);
		expect(body).toBe("fine");
	});
});