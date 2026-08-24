import { describe, expect, it } from "vitest";
import {
	BadGateway,
	BadRequest,
	HttpVersionNotSupported,
	ImATeapot,
	NetworkConnectTimeoutError,
	NotFound,
	UnprocessableContent,
} from "../../src/error/errors";
import {
	HttpError,
	isHttpError,
	STATUS_MESSAGES,
} from "../../src/error/http-error";

describe("HttpError", () => {
	it("carries the status, message and description", () => {
		const error = new HttpError(422, "Invalid", "The payload is malformed");

		expect(error.status).toBe(422);
		expect(error.message).toBe("Invalid");
		expect(error.description).toBe("The payload is malformed");
		expect(error.name).toBe("HttpError");
	});

	it("falls back to the standard reason phrase when no message is given", () => {
		const error = new HttpError(404);

		expect(error.message).toBe("Not Found");
	});

	it("isHttpError narrows HttpError instances only", () => {
		expect(isHttpError(new NotFound())).toBe(true);
		expect(isHttpError(new Error("nope"))).toBe(false);
		expect(isHttpError(null)).toBe(false);
	});

	it("exposes a standard message for every error status", () => {
		const statuses = [400, 404, 405, 413, 418, 429, 451, 500, 503, 505, 599];

		for (const status of statuses)
			expect(
				STATUS_MESSAGES[status as keyof typeof STATUS_MESSAGES],
			).toBeTypeOf("string");
	});
});

describe("error classes", () => {
	it("every exported class is an HttpError subclass", () => {
		const errors = [
			new BadRequest(),
			new NotFound(),
			new UnprocessableContent(),
			new ImATeapot(),
			new HttpVersionNotSupported(),
			new BadGateway(),
			new NetworkConnectTimeoutError(),
		];

		for (const error of errors) expect(error).toBeInstanceOf(HttpError);
	});

	it("generated classes report their real class name", () => {
		expect(new BadRequest().name).toBe("BadRequest");
		expect(new ImATeapot().name).toBe("ImATeapot");
	});

	it("generated classes accept message, description and cause", () => {
		const cause = new Error("db down");
		const error = new BadRequest("Nope", "field x", cause);

		expect(error.message).toBe("Nope");
		expect(error.description).toBe("field x");
		expect(error.cause).toBe(cause);
	});

	it("static classes expose their status", () => {
		expect(BadRequest.status).toBe(400);
		expect(ImATeapot.status).toBe(418);
	});
});
