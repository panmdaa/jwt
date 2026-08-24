import type {
	IncomingHttpHeaders,
	IncomingMessage,
	ServerResponse,
} from "node:http";
import { describe, expect, it, vi } from "vitest";
import { readRawBody } from "../../../src/http/context/body/utils";
import { ContextBodyHandler } from "../../../src/http/context/body-handler";
import { parseQuery } from "../../../src/http/context/utils";

function mockRequest(
	url: string,
	method = "GET",
	headers: IncomingHttpHeaders = {},
): IncomingMessage {
	return {
		url,
		method,
		headers,
		socket: { remoteAddress: "127.0.0.1" },
	} as IncomingMessage;
}

function streamReq(headers: IncomingHttpHeaders = {}): {
	req: IncomingMessage;
	emit: (event: string, arg?: unknown) => void;
} {
	const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
	const req = {
		url: "/users",
		method: "POST",
		headers,
		socket: { remoteAddress: "127.0.0.1" },
		setEncoding: () => {},
		on: (event: string, fn: (arg?: unknown) => void) => {
			listeners[event] ??= [];
			listeners[event].push(fn);
		},
	} as unknown as IncomingMessage;

	return {
		req,
		emit: (event: string, arg?: unknown) => {
			for (const fn of listeners[event] ?? []) fn(arg);
		},
	};
}

describe("parseQuery", () => {
	it("parses a query string into an object", () => {
		expect(parseQuery(new URLSearchParams("page=1&limit=10"))).toEqual({
			page: "1",
			limit: "10",
		});
	});

	it("collects repeated keys into an array", () => {
		expect(parseQuery(new URLSearchParams("tag=a&tag=b"))).toEqual({
			tag: ["a", "b"],
		});
	});

	it("returns an empty object for an empty query", () => {
		expect(parseQuery(new URLSearchParams(""))).toEqual({});
	});
});

describe("ContextBodyHandler", () => {
	it("exposes query params from the search string", () => {
		const req = mockRequest("/users?page=1&limit=10");
		const res = {} as ServerResponse;

		const ctx = new ContextBodyHandler({}, "page=1&limit=10", req, res);

		expect(ctx.query).toEqual({ page: "1", limit: "10" });
	});

	it("exposes an empty query when there is no search string", () => {
		const req = mockRequest("/users");
		const res = {} as ServerResponse;

		const ctx = new ContextBodyHandler({}, "", req, res);

		expect(ctx.query).toEqual({});
	});

	it("creates the context synchronously and lazily reads the body", async () => {
		const { req, emit } = streamReq();
		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.json();
		expect(reading).toBeInstanceOf(Promise);

		emit("data", '{"name":"ana"}');
		emit("end");

		await expect(reading).resolves.toEqual({ name: "ana" });
	});
});

describe("readRawBody", () => {
	it("concatenates stream chunks into a raw buffer", async () => {
		const { req, emit } = streamReq();

		const promise = readRawBody(req);

		emit("data", '{"a":');
		emit("data", "1}");
		emit("end");

		await expect(promise).resolves.toEqual(Buffer.from('{"a":1}'));
	});

	it("defers JSON.parse until the body getter is accessed", async () => {
		const { req, emit } = streamReq();
		const parseSpy = vi.spyOn(JSON, "parse");

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.json();

		emit("data", '{"name":"ana"}');
		emit("end");

		expect(parseSpy).not.toHaveBeenCalled();

		await expect(reading).resolves.toEqual({ name: "ana" });
		expect(parseSpy).toHaveBeenCalledTimes(1);
		parseSpy.mockRestore();
	});

	it("returns an empty object for a non-body method without parsing", async () => {
		const req = mockRequest("/users", "GET");
		const parseSpy = vi.spyOn(JSON, "parse");

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		await expect(ctx.body.json()).resolves.toEqual({});
		expect(parseSpy).not.toHaveBeenCalled();
		parseSpy.mockRestore();
	});

	it("caches the parsed body after the first access", async () => {
		const { req, emit } = streamReq();

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.json();

		emit("data", '{"name":"ana"}');
		emit("end");

		const parsed = await reading;

		expect(parsed).toEqual({ name: "ana" });
		expect(await ctx.body.json()).toBe(parsed);
	});

	it("exposes the raw body as text, buffer and arrayBuffer", async () => {
		const { req, emit } = streamReq();

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const readingText = ctx.body.text();
		const readingBuffer = ctx.body.raw();
		const readingArrayBuffer = ctx.body.arrayBuffer();

		emit("data", "hello");
		emit("end");

		expect(await readingText).toBe("hello");
		expect((await readingBuffer).toString()).toBe("hello");
		expect(Buffer.from(await readingArrayBuffer).toString()).toBe("hello");
	});

	it("caches each body representation after first access", async () => {
		const { req, emit } = streamReq();

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const readingText = ctx.body.text();

		emit("data", '{"name":"ana"}');
		emit("end");

		expect(await readingText).toBe('{"name":"ana"}');
		expect(await ctx.body.text()).toBe('{"name":"ana"}');
		expect(await ctx.body.raw()).toBe(await ctx.body.raw());
		expect(await ctx.body.arrayBuffer()).toBe(await ctx.body.arrayBuffer());
		expect(await ctx.body.json()).toEqual({ name: "ana" });
	});

	it("parses urlencoded form data", async () => {
		const { req, emit } = streamReq({
			"content-type": "application/x-www-form-urlencoded",
		});

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.formData();

		emit("data", "name=ana&age=30");
		emit("end");

		const form = await reading;

		expect(form.get("name")).toBe("ana");
		expect(form.get("age")).toBe("30");
	});

	it("parses multipart form data with fields and files", async () => {
		const boundary = "----testboundary";
		const payload = [
			`--${boundary}`,
			'Content-Disposition: form-data; name="name"',
			"",
			"ana",
			`--${boundary}`,
			'Content-Disposition: form-data; name="avatar"; filename="a.txt"',
			"Content-Type: text/plain",
			"",
			"hello file",
			`--${boundary}--`,
			"",
		].join("\r\n");

		const { req, emit } = streamReq({
			"content-type": `multipart/form-data; boundary=${boundary}`,
		});

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.formData();

		emit("data", payload);
		emit("end");

		const form = await reading;
		const file = form.get("avatar") as File;

		expect(form.get("name")).toBe("ana");
		expect(file.name).toBe("a.txt");
		expect(await file.text()).toBe("hello file");
	});

	it("throws for an unsupported form content type", async () => {
		const { req, emit } = streamReq({
			"content-type": "application/json",
		});

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.formData();

		emit("data", '{"name":"ana"}');
		emit("end");

		await expect(reading).rejects.toThrow("Unsupported form content type");
	});

	it("exposes the body as a web stream", async () => {
		const { req, emit } = streamReq();

		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		const reading = ctx.body.stream();

		emit("data", "hello stream");
		emit("end");

		const stream = await reading;
		const reader = stream.getReader();
		const { value } = await reader.read();

		expect(Buffer.from(value as Uint8Array).toString()).toBe("hello stream");
	});

	it("shares a per-request state between handlers", () => {
		const req = mockRequest("/users", "GET");
		const ctx = new ContextBodyHandler({}, "", req, {} as ServerResponse);

		ctx.state.user = { id: 1, name: "ana" };

		expect(ctx.state.user).toEqual({ id: 1, name: "ana" });
	});
});
