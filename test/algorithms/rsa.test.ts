import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRsa, verifyRsa, RSA_ALGORITHMS } from "../../src/algorithms";
import { InvalidKeyForAlgorithm } from "../../src/error/errors";

describe("RSA signing and verification", () => {
	it("roundtrips for RS256", () => {
		const { publicKey, privateKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = Buffer.from("header.payload", "utf8");
		const signature = signRsa(data, privateKey, "RS256");

		expect(signature).toBeInstanceOf(Buffer);
		expect(verifyRsa(data, signature, publicKey, "RS256")).toBe(true);
	});

	it("roundtrips for RS384", () => {
		const { publicKey, privateKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = "header.payload";
		const signature = signRsa(data, privateKey, "RS384");
		expect(verifyRsa(data, signature, publicKey, "RS384")).toBe(true);
	});

	it("roundtrips for RS512", () => {
		const { publicKey, privateKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
		const signature = signRsa(data, privateKey, "RS512");
		expect(verifyRsa(data, signature, publicKey, "RS512")).toBe(true);
	});

	it("fails with the wrong public key", () => {
		const { publicKey: publicKeyA, privateKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		const { publicKey: publicKeyB } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = "header.payload";
		const signature = signRsa(data, privateKey, "RS256");
		expect(verifyRsa(data, signature, publicKeyB, "RS256")).toBe(false);
		expect(verifyRsa(data, signature, publicKeyA, "RS256")).toBe(true);
	});

	it("fails when the key type is not RSA", () => {
		const { publicKey: publicKeyA, privateKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const { publicKey: ecPublicKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		expect(() => signRsa("data", ecPublicKey as any, "RS256")).toThrow(InvalidKeyForAlgorithm);
		expect(() => verifyRsa("data", "signature", ecPublicKey as any, "RS256")).toThrow(InvalidKeyForAlgorithm);
		expect(() => verifyRsa("data", "signature", "this-is-not-a-valid-key", "RS256")).toThrow(InvalidKeyForAlgorithm);
		expect(() => signRsa("data", privateKey, "RS256")).not.toThrow();
	});

	it("exposes the expected algorithm mapping", () => {
		expect(RSA_ALGORITHMS.RS256).toBe("RSA-SHA256");
		expect(RSA_ALGORITHMS.RS384).toBe("RSA-SHA384");
		expect(RSA_ALGORITHMS.RS512).toBe("RSA-SHA512");
	});
});
