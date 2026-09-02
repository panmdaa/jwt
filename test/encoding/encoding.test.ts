import { describe, it, expect } from "vitest";
import {
	encodeBase64Url,
	decodeBase64Url,
	serializeToBase64Url,
	deserializeFromBase64Url,
} from "../../src/encoding";

describe("base64url encoding/decoding", () => {
	it("encodes and decodes a simple string", () => {
		const input = "hello world";
		const encoded = encodeBase64Url(input);
		const decoded = decodeBase64Url(encoded).toString("utf8");
		expect(decoded).toBe(input);
	});

	it("encodes and decodes a buffer", () => {
		const input = Buffer.from([1, 2, 3, 4, 5]);
		const encoded = encodeBase64Url(input);
		const decoded = decodeBase64Url(encoded);
		expect(decoded).toEqual(input);
	});

	it("encodes and decodes a Uint8Array", () => {
		const input = new Uint8Array([255, 254, 253, 252]);
		const encoded = encodeBase64Url(input);
		const decoded = decodeBase64Url(encoded);
		expect(Buffer.from(decoded)).toEqual(Buffer.from(input));
	});

	it("does not include padding characters in base64url output", () => {
		const encoded = encodeBase64Url("hello");
		expect(encoded).not.toContain("=");
	});

	it("handles UTF-8 multibyte characters", () => {
		const input = "こんにちは世界"; // "hello world" in Japanese
		const encoded = encodeBase64Url(input);
		const decoded = decodeBase64Url(encoded).toString("utf8");
		expect(decoded).toBe(input);
	});

	it("handles emojis and other high-codepoint Unicode", () => {
		const input = "🚀 Hello 🌍";
		const encoded = encodeBase64Url(input);
		const decoded = decodeBase64Url(encoded).toString("utf8");
		expect(decoded).toBe(input);
	});

	it("encodes with - and _ instead of + and /", () => {
		// Craft input that would produce + or / in standard base64
		const input = Buffer.from([251, 254, 255]); // Should produce /// in base64
		const encoded = encodeBase64Url(input);
		expect(encoded).not.toContain("+");
		expect(encoded).not.toContain("/");
		// Verify we can still decode it
		const decoded = decodeBase64Url(encoded);
		expect(decoded).toEqual(input);
	});
});

describe("JSON serialization/deserialization", () => {
	it("serializes and deserializes a plain object", () => {
		const obj = { foo: "bar", num: 42, bool: true };
		const encoded = serializeToBase64Url(obj);
		const decoded = deserializeFromBase64Url(encoded);
		expect(decoded).toEqual(obj);
	});

	it("serializes and deserializes nested objects", () => {
		const obj = { user: { name: "Alice", age: 30 }, tags: ["admin", "user"] };
		const encoded = serializeToBase64Url(obj);
		const decoded = deserializeFromBase64Url(encoded);
		expect(decoded).toEqual(obj);
	});

	it("serializes deterministically (same output for same object)", () => {
		const obj = { z: 1, a: 2, m: 3 };
		const encoded1 = serializeToBase64Url(obj);
		const encoded2 = serializeToBase64Url(obj);
		expect(encoded1).toBe(encoded2);
	});

	it("rejects objects with __proto__ key", () => {
		const obj: any = {};
		Object.defineProperty(obj, "__proto__", {
			value: { polluted: true },
			enumerable: true,
		});
		expect(() => serializeToBase64Url(obj)).toThrow();
	});

	it("rejects objects with constructor key", () => {
		const obj = { foo: "bar", constructor: {} };
		expect(() => serializeToBase64Url(obj)).toThrow();
	});

	it("rejects objects with prototype key", () => {
		const obj = { foo: "bar", prototype: {} };
		expect(() => serializeToBase64Url(obj)).toThrow();
	});

	it("rejects arrays", () => {
		expect(() => serializeToBase64Url([1, 2, 3])).toThrow();
	});

	it("rejects null", () => {
		expect(() => serializeToBase64Url(null)).toThrow();
	});

	it("rejects non-objects", () => {
		expect(() => serializeToBase64Url("string")).toThrow();
		expect(() => serializeToBase64Url(42)).toThrow();
		expect(() => serializeToBase64Url(true)).toThrow();
	});

	it("handles UTF-8 content in object values", () => {
		const obj = { greeting: "こんにちは", emoji: "🎉" };
		const encoded = serializeToBase64Url(obj);
		const decoded = deserializeFromBase64Url(encoded);
		expect(decoded).toEqual(obj);
	});

	it("throws on invalid base64url during deserialization", () => {
		expect(() => deserializeFromBase64Url("!!!invalid base64!!!")).toThrow();
	});

	it("throws on invalid JSON during deserialization", () => {
		const invalidJson = encodeBase64Url("{invalid json}");
		expect(() => deserializeFromBase64Url(invalidJson)).toThrow();
	});

	it("throws if deserialized payload is not an object", () => {
		const arrayPayload = encodeBase64Url("[1, 2, 3]");
		expect(() => deserializeFromBase64Url(arrayPayload)).toThrow();

		const stringPayload = encodeBase64Url('"just a string"');
		expect(() => deserializeFromBase64Url(stringPayload)).toThrow();

		const nullPayload = encodeBase64Url("null");
		expect(() => deserializeFromBase64Url(nullPayload)).toThrow();
	});

	it("detects dangerous keys recursively in nested objects", () => {
		const nested: any = {};
		Object.defineProperty(nested, "__proto__", {
			value: { polluted: true },
			enumerable: true,
		});
		const obj = {
			valid: "field",
			nested,
		};
		expect(() => serializeToBase64Url(obj)).toThrow();
	});
});
