import { generateKeyPairSync, randomBytes } from "node:crypto";

export type AlgorithmName = "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";

export const HMAC_ALGORITHMS = ["HS256", "HS384", "HS512"] as const;
export const RSA_ALGORITHMS = ["RS256", "RS384", "RS512"] as const;
export const ECDSA_ALGORITHMS = ["ES256", "ES384", "ES512"] as const;

export const ALL_ALGORITHMS: AlgorithmName[] = [...HMAC_ALGORITHMS, ...RSA_ALGORITHMS, ...ECDSA_ALGORITHMS];

export function getHmacKeys() {
	return {
		HS256: randomBytes(32),
		HS384: randomBytes(48),
		HS512: randomBytes(64),
	};
}

export function getRsaKeys() {
	return {
		RS256: generateKeyPairSync("rsa", { modulusLength: 2048 }),
		RS384: generateKeyPairSync("rsa", { modulusLength: 2048 }),
		RS512: generateKeyPairSync("rsa", { modulusLength: 2048 }),
	};
}

export function getEcdsaKeys() {
	return {
		ES256: generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
		ES384: generateKeyPairSync("ec", { namedCurve: "secp384r1" }),
		ES512: generateKeyPairSync("ec", { namedCurve: "secp521r1" }),
	};
}

export function benchmarkOperation(name: string, operation: () => void, iterations: number): void {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		operation();
	}
	const elapsedMs = performance.now() - start;
	const opsPerSecond = (iterations / elapsedMs) * 1000;
	console.log(`${name}: ${opsPerSecond.toFixed(2)} ops/sec (${iterations} iterations in ${elapsedMs.toFixed(2)}ms)`);
}
