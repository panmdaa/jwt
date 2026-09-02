import type { KeyObject } from "node:crypto";
import { getAlgorithm, type Algorithm } from "../algorithms";
import { encodeBase64Url } from "../encoding/base64url";
import { serializeToBase64Url } from "../encoding/json-safe";
import { parseDuration, currentTimeInSeconds } from "../utils";

export type JwtSigningKey = string | Buffer | Uint8Array | KeyObject;

export interface SignOptions {
	alg: Algorithm;
	kid?: string;
	expiresIn?: number | string;
	notBefore?: number | string;
	issuer?: string;
	audience?: string | string[];
	subject?: string;
	jwtid?: string;
	addIssuedAt?: boolean;
}

export type JwtPayload = Record<string, unknown> & {
	iat?: number;
	nbf?: number;
	exp?: number;
	iss?: string;
	aud?: string | string[];
	sub?: string;
	jti?: string;
};

/**
 * Sign a JWT payload using the configured algorithm.
 *
 * Explicit `SignOptions` win over any claims already present in the payload.
 * This allows call sites to pass both a raw payload and stronger option-driven
 * claims without ambiguous precedence: the option values are merged last.
 *
 * @param payload Claims to include in the JWT payload
 * @param key Signing key for the chosen algorithm
 * @param options Signing options, including the required JWT algorithm and optional standard claims
 * @returns The signed JWT as `header.payload.signature`
 */
export function sign(
	payload: JwtPayload,
	key: JwtSigningKey,
	options: SignOptions,
): string {
	const header = {
		alg: options.alg,
		typ: "JWT",
		...(options.kid ? { kid: options.kid } : {}),
	};

	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		throw new Error("Payload must be a plain object");
	}

	serializeToBase64Url(payload);

	const normalizedPayload = { ...payload };
	const currentTime = currentTimeInSeconds();

	const explicitClaims: Partial<JwtPayload> = {};
	if (options.issuer !== undefined) explicitClaims.iss = options.issuer;
	if (options.audience !== undefined) explicitClaims.aud = options.audience;
	if (options.subject !== undefined) explicitClaims.sub = options.subject;
	if (options.jwtid !== undefined) explicitClaims.jti = options.jwtid;
	if (options.expiresIn !== undefined) explicitClaims.exp = currentTime + parseDuration(options.expiresIn);
	if (options.notBefore !== undefined) explicitClaims.nbf = currentTime + parseDuration(options.notBefore);
	if (options.addIssuedAt === false) {
		delete (normalizedPayload as JwtPayload).iat;
	} else {
		explicitClaims.iat = currentTime;
	}

	const mergedPayload = {
		...normalizedPayload,
		...explicitClaims,
	};

	const payloadObject = Object.fromEntries(
		Object.entries(mergedPayload).filter(([, value]) => value !== undefined),
	) as JwtPayload;

	if (typeof payloadObject !== "object" || payloadObject === null || Array.isArray(payloadObject)) {
		throw new Error("Payload must be a plain object");
	}

	serializeToBase64Url(payloadObject);

	const encodedHeader = encodeBase64Url(JSON.stringify(header));
	const encodedPayload = encodeBase64Url(JSON.stringify(payloadObject));
	const signingInput = `${encodedHeader}.${encodedPayload}`;
	const algorithm = getAlgorithm(options.alg);
	const signature = algorithm.sign(signingInput, key);
	const encodedSignature = encodeBase64Url(signature);

	return `${signingInput}.${encodedSignature}`;
}
