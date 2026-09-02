import { createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import { InvalidKeyForAlgorithm } from "../error/errors";

export const ECDSA_ALGORITHMS = {
	ES256: { curve: "prime256v1", hash: "sha256" },
	ES384: { curve: "secp384r1", hash: "sha384" },
	ES512: { curve: "secp521r1", hash: "sha512" },
} as const;

export type EcdsaAlgorithm = keyof typeof ECDSA_ALGORITHMS;

/**
 * Normalize an EC private key to a KeyObject and validate its curve.
 *
 * @param key Key in PEM or native KeyObject form
 * @param algorithm Target ECDSA algorithm
 * @returns Validated EC private KeyObject
 */
export function normalizeEcdsaPrivateKey(
	key: string | Buffer | KeyObject,
	algorithm: EcdsaAlgorithm,
): KeyObject {
	let keyObject: KeyObject;
	try {
		keyObject = typeof key === "string" || Buffer.isBuffer(key) ? createPrivateKey(key) : key;
	} catch {
		throw new InvalidKeyForAlgorithm(
			"Private key is not a valid EC private key",
			"The provided private key does not match the requested ECDSA algorithm",
		);
	}

	const expectedCurve = ECDSA_ALGORITHMS[algorithm].curve;
	if (keyObject.type !== "private" || keyObject.asymmetricKeyType !== "ec") {
		throw new InvalidKeyForAlgorithm(
			"Private key is not a valid EC private key",
			"The provided private key does not match the requested ECDSA algorithm",
		);
	}

	const actualCurve = keyObject.asymmetricKeyDetails?.namedCurve ?? "unknown";
	if (actualCurve !== expectedCurve) {
		throw new InvalidKeyForAlgorithm(
			`Private key curve does not match the ${algorithm} algorithm`,
			`Expected curve ${expectedCurve} but received ${actualCurve}`,
		);
	}

	return keyObject;
}

/**
 * Normalize an EC public key to a KeyObject and validate its curve.
 *
 * @param key Key in PEM or native KeyObject form
 * @param algorithm Target ECDSA algorithm
 * @returns Validated EC public KeyObject
 */
export function normalizeEcdsaPublicKey(
	key: string | Buffer | KeyObject,
	algorithm: EcdsaAlgorithm,
): KeyObject {
	let keyObject: KeyObject;
	try {
		keyObject = typeof key === "string" || Buffer.isBuffer(key) ? createPublicKey(key) : key;
	} catch {
		throw new InvalidKeyForAlgorithm(
			"Public key is not a valid EC public key",
			"The provided public key does not match the requested ECDSA algorithm",
		);
	}

	const expectedCurve = ECDSA_ALGORITHMS[algorithm].curve;
	if (keyObject.type !== "public" || keyObject.asymmetricKeyType !== "ec") {
		throw new InvalidKeyForAlgorithm(
			"Public key is not a valid EC public key",
			"The provided public key does not match the requested ECDSA algorithm",
		);
	}

	const actualCurve = keyObject.asymmetricKeyDetails?.namedCurve ?? "unknown";
	if (actualCurve !== expectedCurve) {
		throw new InvalidKeyForAlgorithm(
			`Public key curve does not match the ${algorithm} algorithm`,
			`Expected curve ${expectedCurve} but received ${actualCurve}`,
		);
	}

	return keyObject;
}

/**
 * Sign data using ECDSA with the required P1363-format signature.
 *
 * @param data Data to sign
 * @param privateKey EC private key in PEM or native KeyObject form
 * @param algorithm ECDSA algorithm (`ES256`, `ES384`, `ES512`)
 * @returns Signature as a Buffer in IEEE P1363 format (`r || s`)
 */
export function signEcdsa(
	data: string | Buffer | Uint8Array,
	privateKey: string | Buffer | KeyObject,
	algorithm: EcdsaAlgorithm = "ES256",
): Buffer {
	const normalizedKey = normalizeEcdsaPrivateKey(privateKey, algorithm);
	const input = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
	const signature = sign(ECDSA_ALGORITHMS[algorithm].hash, input, {
		key: normalizedKey,
		dsaEncoding: "ieee-p1363",
		padding: undefined,
	});
	return Buffer.from(signature);
}

/**
 * Verify an ECDSA signature using the required P1363 signature format.
 *
 * @param data Original signed data
 * @param signature Signature to verify in P1363 format
 * @param publicKey EC public key in PEM or native KeyObject form
 * @param algorithm ECDSA algorithm (`ES256`, `ES384`, `ES512`)
 * @returns `true` if the signature matches, otherwise `false`
 */
export function verifyEcdsa(
	data: string | Buffer | Uint8Array,
	signature: string | Buffer | Uint8Array,
	publicKey: string | Buffer | KeyObject,
	algorithm: EcdsaAlgorithm = "ES256",
): boolean {
	const normalizedKey = normalizeEcdsaPublicKey(publicKey, algorithm);
	const input = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
	const signatureBuffer = typeof signature === "string" ? Buffer.from(signature, "utf8") : Buffer.from(signature);
	return verify(ECDSA_ALGORITHMS[algorithm].hash, input, {
		key: normalizedKey,
		dsaEncoding: "ieee-p1363",
		padding: undefined,
	}, signatureBuffer);
}
