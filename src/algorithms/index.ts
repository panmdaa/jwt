import { signHmac, verifyHmac, type HmacAlgorithm } from "./hmac";
import { signRsa, verifyRsa, type RsaAlgorithm } from "./rsa";
import { signEcdsa, verifyEcdsa, type EcdsaAlgorithm } from "./ecdsa";
import { AlgorithmNotAllowed, AlgorithmNone } from "../error/errors";

// Re-export all algorithm implementations and types
export * from "./hmac";
export * from "./rsa";
export * from "./ecdsa";

/**
 * Unified interface for algorithm implementations.
 */
export interface AlgorithmImplementation {
	sign(data: string | Buffer | Uint8Array, key: any): Buffer;
	verify(data: string | Buffer | Uint8Array, signature: string | Buffer | Uint8Array, key: any): boolean;
}

/**
 * Union type of all supported JWT algorithms.
 */
export type Algorithm = HmacAlgorithm | RsaAlgorithm | EcdsaAlgorithm;

/**
 * Central registry mapping algorithm strings to their implementations.
 */
const ALGORITHMS_REGISTRY: Record<Algorithm, AlgorithmImplementation> = {
	HS256: {
		sign: (data, key) => signHmac(data, key, "HS256"),
		verify: (data, signature, key) => verifyHmac(data, signature, key, "HS256"),
	},
	HS384: {
		sign: (data, key) => signHmac(data, key, "HS384"),
		verify: (data, signature, key) => verifyHmac(data, signature, key, "HS384"),
	},
	HS512: {
		sign: (data, key) => signHmac(data, key, "HS512"),
		verify: (data, signature, key) => verifyHmac(data, signature, key, "HS512"),
	},
	RS256: {
		sign: (data, key) => signRsa(data, key, "RS256"),
		verify: (data, signature, key) => verifyRsa(data, signature, key, "RS256"),
	},
	RS384: {
		sign: (data, key) => signRsa(data, key, "RS384"),
		verify: (data, signature, key) => verifyRsa(data, signature, key, "RS384"),
	},
	RS512: {
		sign: (data, key) => signRsa(data, key, "RS512"),
		verify: (data, signature, key) => verifyRsa(data, signature, key, "RS512"),
	},
	ES256: {
		sign: (data, key) => signEcdsa(data, key, "ES256"),
		verify: (data, signature, key) => verifyEcdsa(data, signature, key, "ES256"),
	},
	ES384: {
		sign: (data, key) => signEcdsa(data, key, "ES384"),
		verify: (data, signature, key) => verifyEcdsa(data, signature, key, "ES384"),
	},
	ES512: {
		sign: (data, key) => signEcdsa(data, key, "ES512"),
		verify: (data, signature, key) => verifyEcdsa(data, signature, key, "ES512"),
	},
};

/**
 * Resolve an algorithm string to its implementation.
 *
 * @param algorithm Algorithm string (e.g. `"HS256"`, `"RS512"`, `"ES384"`)
 * @returns The algorithm implementation
 * @throws AlgorithmNone if the algorithm is `"none"`
 * @throws AlgorithmNotAllowed if the algorithm is unsupported or unrecognized
 */
export function getAlgorithm(algorithm: string): AlgorithmImplementation {
	if (algorithm === "none") {
		throw new AlgorithmNone("Algorithm 'none' is not allowed", "The 'none' algorithm is explicitly forbidden in JWT");
	}

	if (!algorithm || !(algorithm in ALGORITHMS_REGISTRY)) {
		throw new AlgorithmNotAllowed(
			`Algorithm '${algorithm}' is not supported`,
			`Only the following algorithms are supported: ${Object.keys(ALGORITHMS_REGISTRY).join(", ")}`,
		);
	}

	return ALGORITHMS_REGISTRY[algorithm as Algorithm];
}
