import { createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_ALGORITHMS = {
	HS256: "sha256",
	HS384: "sha384",
	HS512: "sha512",
} as const;

export type HmacAlgorithm = keyof typeof HMAC_ALGORITHMS;

/**
 * Normalize a secret to a Buffer.
 *
 * @param secret The key to use for HMAC signing
 * @returns A Buffer containing the normalized secret
 */
export function normalizeHmacSecret(secret: string | Buffer): Buffer {
	return Buffer.isBuffer(secret) ? Buffer.from(secret) : Buffer.from(secret, "utf8");
}

/**
 * Sign data using the requested HMAC algorithm.
 *
 * @param data Input data to sign
 * @param secret Secret key used for HMAC
 * @param algorithm The HMAC algorithm (`HS256`, `HS384`, `HS512`)
 * @returns The raw HMAC signature as a Buffer
 */
export function signHmac(
	data: string | Buffer | Uint8Array,
	secret: string | Buffer,
	algorithm: HmacAlgorithm = "HS256",
): Buffer {
	const normalizedSecret = normalizeHmacSecret(secret);
	const input = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
	const hash = createHmac(HMAC_ALGORITHMS[algorithm], normalizedSecret);
	hash.update(input);
	return hash.digest();
}

/**
 * Compare two Buffers in constant time, handling different lengths without
 * leaking information via timing differences.
 *
 * @param left First buffer
 * @param right Second buffer
 * @returns `true` when the buffers match, `false` otherwise
 */
export function compareBuffersConstantTime(left: Buffer, right: Buffer): boolean {
	const length = Math.max(left.length, right.length);
	const leftPadded = Buffer.alloc(length, 0);
	const rightPadded = Buffer.alloc(length, 0);
	left.copy(leftPadded, 0, 0, left.length);
	right.copy(rightPadded, 0, 0, right.length);

	return timingSafeEqual(leftPadded, rightPadded);
}

/**
 * Verify an HMAC signature against the provided data and secret.
 * Uses `crypto.timingSafeEqual` to avoid timing leaks.
 *
 * @param data Input data that was signed
 * @param signature Signature to verify
 * @param secret Secret key used for signing
 * @param algorithm The HMAC algorithm to use
 * @returns `true` if the signature matches, `false` otherwise
 */
export function verifyHmac(
	data: string | Buffer | Uint8Array,
	signature: string | Buffer | Uint8Array,
	secret: string | Buffer,
	algorithm: HmacAlgorithm = "HS256",
): boolean {
	const expectedSignature = signHmac(data, secret, algorithm);
	const actualSignature = Buffer.from(signature);
	return compareBuffersConstantTime(expectedSignature, actualSignature);
}
