import type { KeyObject } from "node:crypto";
import { getAlgorithm, type Algorithm } from "../algorithms";
import { decodeBase64Url } from "../encoding/base64url";
import { isExpired, isNotYetValid, currentTimeInSeconds } from "../utils";
import {
	AlgorithmNotAllowed,
	AudienceMismatch,
	InvalidSignature,
	IssuerMismatch,
	MalformedToken,
	SubjectMismatch,
	TokenExpired,
	TokenNotYetValid,
} from "../error/errors";

export interface VerifyOptions {
	algorithms: Algorithm[];
	issuer?: string;
	audience?: string | string[];
	subject?: string;
	clockTolerance?: number;
	maxTokenLength?: number;
	complete?: boolean;
}

export type VerifiedJwt =
	| Record<string, unknown>
	| {
			header: Record<string, unknown>;
			payload: Record<string, unknown>;
			signature: string;
	  };

function parseJsonObject(value: string, label: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error(`${label} must decode to a JSON object`);
		}
		return parsed as Record<string, unknown>;
	} catch {
		throw new MalformedToken(`Token ${label} is not valid JSON`, `The ${label} segment does not decode to a valid JSON object`);
	}
}

function normalizeAudienceToSet(value?: string | string[]): Set<string> {
	if (value === undefined) return new Set();
	const list = Array.isArray(value) ? value : [value];
	return new Set(list.map((entry) => String(entry)));
}

/**
 * Verify a JWT token using the supplied algorithm allowlist and validation options.
 *
 * Verification order intentionally follows the JWT security rules:
 * 1. structural validation
 * 2. allowed algorithm gate
 * 3. crypto verification
 * 4. time-based checks
 * 5. audience/issuer/subject checks
 * 6. return payload or complete response
 */
export type JwtVerificationKey = string | Buffer | Uint8Array | KeyObject;

export function verify(
	token: string,
	key: JwtVerificationKey,
	options: VerifyOptions,
): Record<string, unknown> | { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string } {
	if (typeof token !== "string") {
		throw new MalformedToken("Token must be a string", "JWT verification requires a string token");
	}

	const maxTokenLength = options.maxTokenLength ?? 1024 * 16;
	if (token.length > maxTokenLength) {
		throw new MalformedToken(
			`Token exceeds maximum length of ${maxTokenLength}`,
			`The JWT length exceeded the allowed maximum of ${maxTokenLength} characters`,
		);
	}

	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new MalformedToken("Token is malformed", "JWT tokens must contain exactly three dot-separated segments");
	}

	const [headerSegment, payloadSegment, signatureSegment] = parts;
	if (!headerSegment || !payloadSegment || !signatureSegment) {
		throw new MalformedToken("Token is malformed", "JWT segments cannot be empty");
	}

	const header = parseJsonObject(Buffer.from(decodeBase64Url(headerSegment)).toString("utf8"), "header");
	const payload = parseJsonObject(Buffer.from(decodeBase64Url(payloadSegment)).toString("utf8"), "payload");

	const headerAlg = header.alg;
	if (typeof headerAlg !== "string") {
		throw new AlgorithmNotAllowed("JWT header 'alg' is missing or invalid", "JWT headers must include a string 'alg' claim");
	}

	if (!options.algorithms.includes(headerAlg as Algorithm)) {
		throw new AlgorithmNotAllowed(
			`Algorithm '${headerAlg}' is not permitted`,
			`This token uses an unsupported or disallowed algorithm`,
		);
	}

	if (headerAlg === "none") {
		throw new AlgorithmNotAllowed("Algorithm 'none' is not allowed", "JWT 'none' must be rejected explicitly");
	}

	const algorithm = getAlgorithm(headerAlg);
	const signingInput = `${headerSegment}.${payloadSegment}`;
	const signature = decodeBase64Url(signatureSegment);
	const isValid = algorithm.verify(signingInput, signature, key);
	if (!isValid) {
		throw new InvalidSignature("Token signature verification failed", "The JWT signature does not match the supplied key");
	}

	const currentTime = currentTimeInSeconds();
	const clockTolerance = options.clockTolerance ?? 0;
	if (typeof payload.exp === "number" && isExpired(payload.exp, currentTime, clockTolerance)) {
		throw new TokenExpired("Token has expired", `The exp claim (${payload.exp}) is no longer valid`);
	}
	if (typeof payload.nbf === "number" && isNotYetValid(payload.nbf, currentTime, clockTolerance)) {
		throw new TokenNotYetValid("Token is not yet valid", `The nbf claim (${payload.nbf}) is in the future`);
	}

	if (options.audience !== undefined) {
		const expectedAudience = normalizeAudienceToSet(options.audience);
		const providedAudience = normalizeAudienceToSet(Array.isArray(payload.aud) ? payload.aud : typeof payload.aud === "string" ? payload.aud : undefined);
		const hasMatch = Array.from(providedAudience).some((value) => expectedAudience.has(value));
		if (!hasMatch) {
			throw new AudienceMismatch("Token audience claim does not match expected value", "The JWT audience does not match the configured audience");
		}
	}

	if (options.issuer !== undefined && payload.iss !== options.issuer) {
		throw new IssuerMismatch("Token issuer claim does not match expected value", `Expected issuer '${options.issuer}' but received '${String(payload.iss ?? "undefined")}'`);
	}

	if (options.subject !== undefined && payload.sub !== options.subject) {
		throw new SubjectMismatch("Token subject claim does not match expected value", `Expected subject '${options.subject}' but received '${String(payload.sub ?? "undefined")}'`);
	}

	if (options.complete) {
		return {
			header,
			payload,
			signature: signatureSegment,
		};
	}

	return payload;
}
