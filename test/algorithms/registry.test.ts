import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAlgorithm, type Algorithm } from "../../src/algorithms";
import { AlgorithmNotAllowed, AlgorithmNone } from "../../src/error/errors";

describe("Algorithm registry", () => {
	const supportedAlgorithms: Algorithm[] = [
		"HS256",
		"HS384",
		"HS512",
		"RS256",
		"RS384",
		"RS512",
		"ES256",
		"ES384",
		"ES512",
	];

	it.each(supportedAlgorithms)("%s resolves to a functional implementation", (algorithm) => {
		const impl = getAlgorithm(algorithm);
		expect(impl).toBeDefined();
		expect(impl.sign).toBeInstanceOf(Function);
		expect(impl.verify).toBeInstanceOf(Function);
	});

	it("all HMAC algorithms work with a symmetric key", () => {
		const key = randomBytes(32);
		const data = "test.data";

		for (const alg of ["HS256", "HS384", "HS512"]) {
			const impl = getAlgorithm(alg);
			const signature = impl.sign(data, key);
			expect(impl.verify(data, signature, key)).toBe(true);
		}
	});

	it("all RSA algorithms work with an RSA key pair", () => {
		const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const data = "test.data";

		for (const alg of ["RS256", "RS384", "RS512"]) {
			const impl = getAlgorithm(alg);
			const signature = impl.sign(data, privateKey);
			expect(impl.verify(data, signature, publicKey)).toBe(true);
		}
	});

	it("all ECDSA algorithms work with an EC key pair", () => {
		const curves = ["prime256v1", "secp384r1", "secp521r1"];
		const algorithms = ["ES256", "ES384", "ES512"];

		for (let i = 0; i < algorithms.length; i++) {
			const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: curves[i] });
			const data = "test.data";
			const impl = getAlgorithm(algorithms[i]);
			const signature = impl.sign(data, privateKey);
			expect(impl.verify(data, signature, publicKey)).toBe(true);
		}
	});

	it("rejects the 'none' algorithm", () => {
		expect(() => getAlgorithm("none")).toThrow(AlgorithmNone);
	});

	it("rejects unrecognized algorithms", () => {
		expect(() => getAlgorithm("UNKNOWN")).toThrow(AlgorithmNotAllowed);
		expect(() => getAlgorithm("HS128")).toThrow(AlgorithmNotAllowed);
		expect(() => getAlgorithm("CUSTOM")).toThrow(AlgorithmNotAllowed);
	});

	it("rejects empty algorithm string", () => {
		expect(() => getAlgorithm("")).toThrow(AlgorithmNotAllowed);
	});

	it("rejects whitespace-only algorithm string", () => {
		expect(() => getAlgorithm("   ")).toThrow(AlgorithmNotAllowed);
	});

	it("is case-sensitive", () => {
		expect(() => getAlgorithm("hs256")).toThrow(AlgorithmNotAllowed);
		expect(() => getAlgorithm("Hs256")).toThrow(AlgorithmNotAllowed);
		expect(() => getAlgorithm("HS256 ")).toThrow(AlgorithmNotAllowed);
	});
});
