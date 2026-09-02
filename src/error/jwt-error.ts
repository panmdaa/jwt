/** JWT error codes for various failure scenarios. */
export const JWT_ERROR_CODES = {
	MALFORMED_TOKEN: "ERR_MALFORMED_TOKEN",
	INVALID_SIGNATURE: "ERR_INVALID_SIGNATURE",
	ALGORITHM_NOT_ALLOWED: "ERR_ALGORITHM_NOT_ALLOWED",
	ALGORITHM_NONE: "ERR_ALGORITHM_NONE",
	TOKEN_EXPIRED: "ERR_TOKEN_EXPIRED",
	TOKEN_NOT_YET_VALID: "ERR_TOKEN_NOT_YET_VALID",
	AUDIENCE_MISMATCH: "ERR_AUDIENCE_MISMATCH",
	ISSUER_MISMATCH: "ERR_ISSUER_MISMATCH",
	SUBJECT_MISMATCH: "ERR_SUBJECT_MISMATCH",
	INVALID_KEY_FOR_ALGORITHM: "ERR_INVALID_KEY_FOR_ALGORITHM",
} as const;

export type JwtErrorCode = (typeof JWT_ERROR_CODES)[keyof typeof JWT_ERROR_CODES];

/** Standard error messages for each JWT error code. */
export const JWT_ERROR_MESSAGES: Record<JwtErrorCode, string> = {
	[JWT_ERROR_CODES.MALFORMED_TOKEN]: "Token is malformed or has invalid structure",
	[JWT_ERROR_CODES.INVALID_SIGNATURE]: "Token signature verification failed",
	[JWT_ERROR_CODES.ALGORITHM_NOT_ALLOWED]: "Algorithm is not permitted for this operation",
	[JWT_ERROR_CODES.ALGORITHM_NONE]: "Algorithm 'none' is not allowed",
	[JWT_ERROR_CODES.TOKEN_EXPIRED]: "Token has expired",
	[JWT_ERROR_CODES.TOKEN_NOT_YET_VALID]: "Token is not yet valid (nbf)",
	[JWT_ERROR_CODES.AUDIENCE_MISMATCH]: "Token audience claim does not match expected value",
	[JWT_ERROR_CODES.ISSUER_MISMATCH]: "Token issuer claim does not match expected value",
	[JWT_ERROR_CODES.SUBJECT_MISMATCH]: "Token subject claim does not match expected value",
	[JWT_ERROR_CODES.INVALID_KEY_FOR_ALGORITHM]: "Cryptographic key is invalid for the specified algorithm",
};

/**
 * Base error class for JWT-related failures.
 * Carries an error code and optional descriptive details.
 */
export class JwtError extends Error {
	readonly code: JwtErrorCode;

	constructor(
		code: JwtErrorCode,
		message?: string,
		readonly description?: string,
		override readonly cause?: unknown,
	) {
		super(message ?? JWT_ERROR_MESSAGES[code]);
		this.code = code;
		this.name = this.constructor.name;
	}
}

/** Type guard for any object that is a `JwtError`. */
export function isJwtError(error: unknown): error is JwtError {
	return error instanceof JwtError;
}
