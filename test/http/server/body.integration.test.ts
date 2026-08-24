import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
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

function httpSend(
	port: number,
	path: string,
	method: string,
	body?: string | Buffer,
	headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
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
						headers: res.headers as Record<string, string>,
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

describe("Server body integration", () => {
	it("reads a JSON body and responds with parsed data", async () => {
		const server = new Server();
		server.post("/echo", async ({ body, response }) => {
			response.json(await body.json());
		});
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/echo",
			"POST",
			JSON.stringify({ hello: "world", n: 42 }),
			{ "content-type": "application/json" },
		);

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ hello: "world", n: 42 });
	});

	it("parses an empty JSON body as an empty object", async () => {
		const server = new Server();
		server.post("/echo", async ({ body, response }) => {
			response.json(await body.json());
		});
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/echo",
			"POST",
			"",
			{ "content-type": "application/json" },
		);

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({});
	});

	it("parses application/x-www-form-urlencoded bodies via formData", async () => {
		const server = new Server();
		server.post("/form", async ({ body, response }) => {
			const form = await body.formData();
			response.json({
				name: String(form.get("name")),
				age: String(form.get("age")),
			});
		});
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/form",
			"POST",
			"name=jane&age=33",
			{ "content-type": "application/x-www-form-urlencoded" },
		);

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ name: "jane", age: "33" });
	});

	it("parses a real multipart upload with a file field", async () => {
		const server = new Server();
		server.post("/upload", async ({ body, response }) => {
			const form = await body.formData();
			const file = form.get("avatar") as File;
			response.json({
				name: String(form.get("name")),
				file: {
					name: file.name,
					size: file.size,
					type: file.type,
				},
			});
		});
		const port = await listen(server);

		const boundary = "----panmdaaBoundary123";
		const fileContent = Buffer.from("fake-image-bytes");
		const payload = Buffer.concat([
			Buffer.from(
				`--${boundary}\r\n` +
					`Content-Disposition: form-data; name="name"\r\n\r\n` +
					`pic\r\n`,
			),
			Buffer.from(
				`--${boundary}\r\n` +
					`Content-Disposition: form-data; name="avatar"; filename="avatar.png"\r\n` +
					`Content-Type: image/png\r\n\r\n`,
			),
			fileContent,
			Buffer.from(`\r\n--${boundary}--\r\n`),
		]);

		const { status, body } = await httpSend(
			port,
			"/upload",
			"POST",
			payload,
			{ "content-type": `multipart/form-data; boundary=${boundary}` },
		);

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({
			name: "pic",
			file: {
				name: "avatar.png",
				size: fileContent.byteLength,
				type: "image/png",
			},
		});
	});

	it("rejects bodies that exceed maxBodySize while streaming", async () => {
		const server = new Server({ maxBodySize: 64 });
		server.post("/upload", async ({ body, response }) => {
			response.text((await body.raw()).byteLength.toString());
		});
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/upload",
			"POST",
			"x".repeat(1000),
			{ "content-type": "text/plain" },
		);

		expect(status).toBe(413);
		expect(JSON.parse(body)).toEqual({
			status: 413,
			message: "Request body exceeds the 64 byte limit",
		});
	});

	it("returns an empty raw body when no payload is sent", async () => {
		const server = new Server();
		server.post("/probe", async ({ body, response }) => {
			const raw = await body.raw();
			response.json({ bytes: raw.byteLength });
		});
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/probe", "POST");

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ bytes: 0 });
	});

	it("exposes the body as a web ReadableStream", async () => {
		const server = new Server();
		server.post("/stream", async ({ body, response }) => {
			const stream = await body.stream();
			const reader = stream.getReader();
			const chunks: string[] = [];
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(new TextDecoder().decode(value));
			}
			response.json({ data: chunks.join("") });
		});
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/stream",
			"POST",
			"streamed-payload",
			{ "content-type": "text/plain" },
		);

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ data: "streamed-payload" });
	});
});
