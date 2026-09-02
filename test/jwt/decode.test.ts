import { describe, expect, it } from "vitest";
import { sign } from "../../src/jwt/sign";
import { decode } from "../../src/jwt/decode";
import { MalformedToken } from "../../src/error/errors";

describe("decode", () => {
	it("decodes a valid token correctly", () => {
		const token = sign({ sub: "user_123", foo: "bar" }, "secret", { alg: "HS256" });
		const decoded = decode(token);

		expect(decoded.header).toMatchObject({ alg: "HS256", typ: "JWT" });
		expect(decoded.payload).toMatchObject({ sub: "user_123", foo: "bar" });
		expect(decoded.payload).toHaveProperty("iat");
	});

	it("throws when the token is malformed", () => {
		expect(() => decode("abc")).toThrow(MalformedToken);
		expect(() => decode("header.payload")).toThrow(MalformedToken);
	});
});
