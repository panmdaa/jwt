import { decodeBase64Url } from "../encoding/base64url";
import { MalformedToken } from "../error/errors";

function parseJsonObject(segment: string, label: string): Record<string, unknown> {
	try {
		const decoded = decodeBase64Url(segment);
		const parsed = JSON.parse(decoded.toString("utf8"));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error(`${label} must decode to a JSON object`);
		}
		return parsed as Record<string, unknown>;
	} catch {
		throw new MalformedToken(
			`Token ${label} is malformed`,
			`The ${label} segment is not valid base64url JSON`,
		);
	}
}

/**
 * Decode a JWT without verifying its signature or validating claims.
 *
 * **This result must never be used as the basis for authentication or authorization decisions.**
 * It is intended only for debugging, logging, and inspection of token metadata.
 *
 * @param token The JWT as a string
 * @returns The decoded header and payload objects
 * @throws MalformedToken when the token cannot be parsed into three valid JSON segments
 */
export function decode(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
	if (typeof token !== "string") {
		throw new MalformedToken("Token must be a string", "JWT decode requires a string token");
	}

	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new MalformedToken("Token is malformed", "JWT tokens must contain exactly three segments");
	}

	const [headerSegment, payloadSegment] = parts;
	if (!headerSegment || !payloadSegment) {
		throw new MalformedToken("Token is malformed", "JWT segments cannot be empty");
	}

	return {
		header: parseJsonObject(headerSegment, "header"),
		payload: parseJsonObject(payloadSegment, "payload"),
	};
}
