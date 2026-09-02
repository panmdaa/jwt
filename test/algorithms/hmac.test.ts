import { describe, expect, it } from "vitest";
import {
	HMAC_ALGORITHMS,
	compareBuffersConstantTime,
	signHmac,
	verifyHmac,
} from "../../src/algorithms";

describe("HMAC signing and verification", () => {
	it("roundtrips for HS256", () => {
		const secret = "super-secret-key";
		const data = "header.payload";
		const signature = signHmac(data, secret, "HS256");

		expect(signature).toBeInstanceOf(Buffer);
		expect(verifyHmac(data, signature, secret, "HS256")).toBe(true);
	});

	it("roundtrips for HS384", () => {
		const secret = Buffer.from("another-secret", "utf8");
		const data = Buffer.from("header.payload", "utf8");
		const signature = signHmac(data, secret, "HS384");

		expect(signature).toBeInstanceOf(Buffer);
		expect(verifyHmac(data, signature, secret, "HS384")).toBe(true);
	});

	it("roundtrips for HS512", () => {
		const secret = "top-secret";
		const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
		const signature = signHmac(data, secret, "HS512");

		expect(signature).toBeInstanceOf(Buffer);
		expect(verifyHmac(data, signature, secret, "HS512")).toBe(true);
	});

	it("fails when a signature byte is altered", () => {
		const secret = "secret";
		const data = "header.payload";
		const signature = signHmac(data, secret, "HS256");
		const tampered = Buffer.from(signature);
		tampered[0] ^= 0xff;

		expect(verifyHmac(data, tampered, secret, "HS256")).toBe(false);
	});

	it("fails when data changes", () => {
		const secret = "secret";
		const data = "header.payload";
		const signature = signHmac(data, secret, "HS256");
		const alteredData = "header.payload!";

		expect(verifyHmac(alteredData, signature, secret, "HS256")).toBe(false);
	});

	it("fails with a different secret", () => {
		const secretA = "secret-a";
		const secretB = "secret-b";
		const data = "header.payload";
		const signature = signHmac(data, secretA, "HS256");

		expect(verifyHmac(data, signature, secretB, "HS256")).toBe(false);
	});

	it("exposes the expected algorithm mapping", () => {
		expect(HMAC_ALGORITHMS.HS256).toBe("sha256");
		expect(HMAC_ALGORITHMS.HS384).toBe("sha384");
		expect(HMAC_ALGORITHMS.HS512).toBe("sha512");
	});

	it("compares buffers in constant-time for different lengths without relying on direct equality", () => {
		const left = Buffer.from([1, 2, 3]);
		const right = Buffer.from([1, 2, 3, 4]);

		expect(compareBuffersConstantTime(left, right)).toBe(false);
		expect(compareBuffersConstantTime(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3]))).toBe(true);
	});
});
