import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signEcdsa, verifyEcdsa, ECDSA_ALGORITHMS } from "../../src/algorithms";
import { InvalidKeyForAlgorithm } from "../../src/error/errors";

describe("ECDSA signing and verification", () => {
	it("roundtrips for ES256", () => {
		const { publicKey, privateKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = Buffer.from("header.payload", "utf8");
		const signature = signEcdsa(data, privateKey, "ES256");
		expect(signature).toBeInstanceOf(Buffer);
		expect(verifyEcdsa(data, signature, publicKey, "ES256")).toBe(true);
	});

	it("roundtrips for ES384", () => {
		const { publicKey, privateKey } = generateKeyPairSync("ec", {
			namedCurve: "secp384r1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = "header.payload";
		const signature = signEcdsa(data, privateKey, "ES384");
		expect(verifyEcdsa(data, signature, publicKey, "ES384")).toBe(true);
	});

	it("roundtrips for ES512", () => {
		const { publicKey, privateKey } = generateKeyPairSync("ec", {
			namedCurve: "secp521r1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
		const signature = signEcdsa(data, privateKey, "ES512");
		expect(verifyEcdsa(data, signature, publicKey, "ES512")).toBe(true);
	});

	it("fails when the curve does not match the algorithm", () => {
		const { publicKey, privateKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		expect(() => signEcdsa("data", privateKey, "ES384")).toThrow(InvalidKeyForAlgorithm);
		expect(() => verifyEcdsa("data", "signature", publicKey, "ES384")).toThrow(InvalidKeyForAlgorithm);
	});

	it("fails when the signature is altered", () => {
		const { publicKey, privateKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		const data = "header.payload";
		const signature = signEcdsa(data, privateKey, "ES256");
		const tampered = Buffer.from(signature);
		tampered[0] ^= 0xff;

		expect(verifyEcdsa(data, tampered, publicKey, "ES256")).toBe(false);
	});

	it("exposes the expected curve-to-algorithm mapping", () => {
		expect(ECDSA_ALGORITHMS.ES256.curve).toBe("prime256v1");
		expect(ECDSA_ALGORITHMS.ES384.curve).toBe("secp384r1");
		expect(ECDSA_ALGORITHMS.ES512.curve).toBe("secp521r1");
	});
});
