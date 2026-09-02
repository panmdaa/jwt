import { createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import { InvalidKeyForAlgorithm } from "../error/errors";

export const RSA_ALGORITHMS = {
	RS256: "RSA-SHA256",
	RS384: "RSA-SHA384",
	RS512: "RSA-SHA512",
} as const;

export type RsaAlgorithm = keyof typeof RSA_ALGORITHMS;

/**
 * Normalize a private RSA key into a native KeyObject.
 *
 * @param key Private key as PEM or native KeyObject
 * @returns A validated RSA private KeyObject
 * @throws InvalidKeyForAlgorithm if the key is not RSA
 */
export function normalizeRsaPrivateKey(key: string | Buffer | KeyObject): KeyObject {
	let keyObject: KeyObject;
	try {
		keyObject = typeof key === "string" || Buffer.isBuffer(key) ? createPrivateKey(key) : key;
	} catch {
		throw new InvalidKeyForAlgorithm(
			"Private key is not a valid RSA private key",
			"The provided private key does not match the requested RSA algorithm",
		);
	}

	if (keyObject.type !== "private" || keyObject.asymmetricKeyType !== "rsa") {
		throw new InvalidKeyForAlgorithm(
			"Private key is not a valid RSA private key",
			"The provided private key does not match the requested RSA algorithm",
		);
	}

	return keyObject;
}

/**
 * Normalize a public RSA key into a native KeyObject.
 *
 * @param key Public key as PEM or native KeyObject
 * @returns A validated RSA public KeyObject
 * @throws InvalidKeyForAlgorithm if the key is not RSA
 */
export function normalizeRsaPublicKey(key: string | Buffer | KeyObject): KeyObject {
	let keyObject: KeyObject;
	try {
		keyObject = typeof key === "string" || Buffer.isBuffer(key) ? createPublicKey(key) : key;
	} catch {
		throw new InvalidKeyForAlgorithm(
			"Public key is not a valid RSA public key",
			"The provided public key does not match the requested RSA algorithm",
		);
	}

	if (keyObject.type !== "public" || keyObject.asymmetricKeyType !== "rsa") {
		throw new InvalidKeyForAlgorithm(
			"Public key is not a valid RSA public key",
			"The provided public key does not match the requested RSA algorithm",
		);
	}

	return keyObject;
}

/**
 * Sign data using RSA PKCS#1 v1.5.
 *
 * @param data Data to sign
 * @param privateKey RSA private key in PEM or KeyObject form
 * @param algorithm RSA signing algorithm (`RS256`, `RS384`, `RS512`)
 * @returns Signature as a Buffer
 */
export function signRsa(
	data: string | Buffer | Uint8Array,
	privateKey: string | Buffer | KeyObject,
	algorithm: RsaAlgorithm = "RS256",
): Buffer {
	const normalizedKey = normalizeRsaPrivateKey(privateKey);
	const input = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
	return sign(RSA_ALGORITHMS[algorithm], input, normalizedKey);
}

/**
 * Verify a signature using RSA PKCS#1 v1.5.
 *
 * @param data Original signed data
 * @param signature Signature to verify
 * @param publicKey RSA public key in PEM or KeyObject form
 * @param algorithm RSA verification algorithm (`RS256`, `RS384`, `RS512`)
 * @returns `true` if the signature matches, otherwise `false`
 */
export function verifyRsa(
	data: string | Buffer | Uint8Array,
	signature: string | Buffer | Uint8Array,
	publicKey: string | Buffer | KeyObject,
	algorithm: RsaAlgorithm = "RS256",
): boolean {
	const normalizedKey = normalizeRsaPublicKey(publicKey);
	const input = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
	const signatureBuffer = typeof signature === "string" ? Buffer.from(signature, "utf8") : Buffer.from(signature);
	return verify(RSA_ALGORITHMS[algorithm], input, normalizedKey, signatureBuffer);
}
