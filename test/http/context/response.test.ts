import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { lookup } from "../../../src/generated/index";
import { ResponseContext } from "../../../src/http/context/response/response";

function mockResponse() {
	const headers: Record<string, string | string[]> = {};
	let statusCode = 200;
	let body = "";

	const res = new Writable({
		write(chunk, _encoding, callback) {
			body += chunk.toString();
			callback();
		},
	});

	Object.defineProperty(res, "statusCode", {
		get() {
			return statusCode;
		},
		set(code: number) {
			statusCode = code;
		},
	});

	(res as unknown as ServerResponse).setHeader = (
		name: string,
		value: string | string[],
	) => {
		headers[name] = value;
		return res as unknown as ServerResponse;
	};

	(res as unknown as ServerResponse).writeHead = ((
		status: number,
		responseHeaders: Record<string, string | string[]>,
	) => {
		statusCode = status;
		for (const [name, value] of Object.entries(responseHeaders)) {
			headers[name] = value;
		}
		return res as unknown as ServerResponse;
	}) as unknown as ServerResponse["writeHead"];

	return {
		context: new ResponseContext(res as unknown as ServerResponse),
		res: res as unknown as ServerResponse,
		get statusCode() {
			return statusCode;
		},
		get headers() {
			return headers;
		},
		get body() {
			return body;
		},
	};
}

describe("ResponseContext", () => {
	it("exposes the native response", () => {
		const mock = mockResponse();
		expect(mock.context.native).toBe(mock.res);
	});

	it("sets and reads the status", () => {
		const { context } = mockResponse();

		context.status = 404;

		expect(context.status).toBe(404);
	});

	it("writes the status code to the native response on end", () => {
		const mock = mockResponse();

		mock.context.status = 201;
		mock.context.send("created");

		expect(mock.statusCode).toBe(201);
	});

	describe("headers", () => {
		it("sets a header through the global headers object", () => {
			const mock = mockResponse();

			mock.context.headers["X-Custom"] = "foo";
			mock.context.send("");

			expect(mock.headers["X-Custom"]).toBe("foo");
		});

		it("reads a header value", () => {
			const { context } = mockResponse();

			context.headers["X-Custom"] = "foo";

			expect(context.header("X-Custom")).toBe("foo");
			expect(context.header("Missing")).toBeUndefined();
		});

		it("sets a header through the header method", () => {
			const mock = mockResponse();

			mock.context.header("X-Custom", "foo");
			mock.context.send("");

			expect(mock.headers["X-Custom"]).toBe("foo");
		});

		it("removes a header", () => {
			const mock = mockResponse();

			mock.context.headers["X-Custom"] = "foo";
			mock.context.removeHeader("X-Custom");
			mock.context.send("");

			expect(mock.headers["X-Custom"]).toBeUndefined();
		});

		it("sets a content type through the type method", () => {
			const mock = mockResponse();

			mock.context.type("application/pdf");
			mock.context.send("");

			expect(mock.headers["Content-Type"]).toBe(
				"application/pdf; charset=utf-8",
			);
		});
	});

	describe("send", () => {
		it("writes the chunk to the body", () => {
			const mock = mockResponse();

			mock.context.send("hello");

			expect(mock.body).toBe("hello");
		});

		it("is idempotent after the first send", () => {
			const mock = mockResponse();

			mock.context.send("one");
			mock.context.send("two");

			expect(mock.body).toBe("one");
		});

		it("infers the content type for a plain string", () => {
			const mock = mockResponse();

			mock.context.send("hello");

			expect(mock.headers["Content-Type"]).toBe("text/plain; charset=utf-8");
		});

		it("infers JSON for objects", () => {
			const mock = mockResponse();

			mock.context.send({ name: "ana" });

			expect(mock.headers["Content-Type"]).toBe(
				"application/json; charset=utf-8",
			);
			expect(mock.body).toBe('{"name":"ana"}');
		});

		it("infers octet-stream for binary data", () => {
			const mock = mockResponse();

			mock.context.send(new Uint8Array([1, 2, 3]));

			expect(mock.headers["Content-Type"]).toBe("application/octet-stream");
		});

		it("does not override an explicit content type", () => {
			const mock = mockResponse();

			mock.context.type("application/xml");
			mock.context.send({ name: "ana" });

			expect(mock.headers["Content-Type"]).toBe(
				"application/xml; charset=utf-8",
			);
		});
	});

	describe("json", () => {
		it("sets the JSON content type with utf-8", () => {
			const mock = mockResponse();

			mock.context.json({ a: 1 });

			expect(mock.headers["Content-Type"]).toBe(
				"application/json; charset=utf-8",
			);
		});

		it("serializes the payload", () => {
			const mock = mockResponse();

			mock.context.json({ name: "ana" });

			expect(mock.body).toBe('{"name":"ana"}');
		});

		it("does not override an explicit content type", () => {
			const mock = mockResponse();

			mock.context.type("text/xml");
			mock.context.json({ a: 1 });

			expect(mock.headers["Content-Type"]).toBe("text/xml; charset=utf-8");
		});
	});

	describe("html", () => {
		it("sets the HTML content type with utf-8", () => {
			const mock = mockResponse();

			mock.context.html("<p>hi</p>");

			expect(mock.headers["Content-Type"]).toBe("text/html; charset=utf-8");
		});

		it("writes the markup", () => {
			const mock = mockResponse();

			mock.context.html("<p>hi</p>");

			expect(mock.body).toBe("<p>hi</p>");
		});
	});

	describe("text", () => {
		it("sets the plain text content type with utf-8", () => {
			const mock = mockResponse();

			mock.context.text("hola");

			expect(mock.headers["Content-Type"]).toBe("text/plain; charset=utf-8");
		});

		it("writes the text", () => {
			const mock = mockResponse();

			mock.context.text("hola");

			expect(mock.body).toBe("hola");
		});
	});

	describe("redirect", () => {
		it("redirects with a 302 by default", () => {
			const mock = mockResponse();

			mock.context.redirect("/login");

			expect(mock.headers.Location).toBe("/login");
			expect(mock.statusCode).toBe(302);
		});

		it("redirects with a custom status", () => {
			const mock = mockResponse();

			mock.context.redirect("/gone", 301);

			expect(mock.statusCode).toBe(301);
		});
	});

	describe("stream", () => {
		it("streams a readable into the response", async () => {
			const mock = mockResponse();

			await mock.context.stream(Readable.from(["hola", " ", "mundo"]));

			expect(mock.body).toBe("hola mundo");
		});
	});

	describe("file", () => {
		it("streams a file with the correct headers", async () => {
			const dir = mkdtempSync(join(tmpdir(), "panmdaa-"));
			const file = join(dir, "data.txt");
			writeFileSync(file, "file content");

			const mock = mockResponse();

			await mock.context.file(file);

			expect(mock.headers["Content-Type"]).toBe("text/plain");
			expect(mock.headers["Content-Length"]).toBe("12");
			expect(mock.headers["Content-Disposition"]).toBe(
				'inline; filename="data.txt"',
			);
			expect(mock.body).toBe("file content");

			rmSync(dir, { recursive: true, force: true });
		});
	});

	describe("download", () => {
		it("streams a file as an attachment", async () => {
			const dir = mkdtempSync(join(tmpdir(), "panmdaa-"));
			const file = join(dir, "report.csv");
			writeFileSync(file, "a,b,c");

			const mock = mockResponse();

			await mock.context.download(file);

			expect(mock.headers["Content-Disposition"]).toBe(
				'attachment; filename="report.csv"',
			);
			expect(mock.headers["Content-Type"]).toBe("text/csv");
			expect(mock.body).toBe("a,b,c");

			rmSync(dir, { recursive: true, force: true });
		});

		it("uses a custom filename when provided", async () => {
			const dir = mkdtempSync(join(tmpdir(), "panmdaa-"));
			const file = join(dir, "internal.txt");
			writeFileSync(file, "data");

			const mock = mockResponse();

			await mock.context.download(file, "export.txt");

			expect(mock.headers["Content-Disposition"]).toBe(
				'attachment; filename="export.txt"',
			);

			rmSync(dir, { recursive: true, force: true });
		});
	});

	it("internal end is idempotent", () => {
		const mock = mockResponse();

		mock.context.text("once");
		mock.context.end();

		expect(mock.body).toBe("once");
	});
});

describe("lookup", () => {
	it("returns the content type for known extensions", () => {
		expect(lookup("html")).toBe("text/html");
		expect(lookup("js")).toBe("text/javascript");
		expect(lookup("png")).toBe("image/png");
	});

	it("returns undefined for unknown extensions", () => {
		expect(lookup("xyz")).toBeUndefined();
	});

	it("is case-insensitive", () => {
		expect(lookup("HTML")).toBe("text/html");
	});
});
