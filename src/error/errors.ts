import { JwtError, JWT_ERROR_CODES } from "./jwt-error";

export class MalformedToken extends JwtError {
	static readonly code = JWT_ERROR_CODES.MALFORMED_TOKEN;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.MALFORMED_TOKEN, message, description, cause);
	}
}

export class InvalidSignature extends JwtError {
	static readonly code = JWT_ERROR_CODES.INVALID_SIGNATURE;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.INVALID_SIGNATURE, message, description, cause);
	}
}

export class AlgorithmNotAllowed extends JwtError {
	static readonly code = JWT_ERROR_CODES.ALGORITHM_NOT_ALLOWED;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.ALGORITHM_NOT_ALLOWED, message, description, cause);
	}
}

export class AlgorithmNone extends JwtError {
	static readonly code = JWT_ERROR_CODES.ALGORITHM_NONE;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.ALGORITHM_NONE, message, description, cause);
	}
}

export class TokenExpired extends JwtError {
	static readonly code = JWT_ERROR_CODES.TOKEN_EXPIRED;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.TOKEN_EXPIRED, message, description, cause);
	}
}

export class TokenNotYetValid extends JwtError {
	static readonly code = JWT_ERROR_CODES.TOKEN_NOT_YET_VALID;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.TOKEN_NOT_YET_VALID, message, description, cause);
	}
}

export class AudienceMismatch extends JwtError {
	static readonly code = JWT_ERROR_CODES.AUDIENCE_MISMATCH;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.AUDIENCE_MISMATCH, message, description, cause);
	}
}

export class IssuerMismatch extends JwtError {
	static readonly code = JWT_ERROR_CODES.ISSUER_MISMATCH;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.ISSUER_MISMATCH, message, description, cause);
	}
}

export class SubjectMismatch extends JwtError {
	static readonly code = JWT_ERROR_CODES.SUBJECT_MISMATCH;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.SUBJECT_MISMATCH, message, description, cause);
	}
}

export class InvalidKeyForAlgorithm extends JwtError {
	static readonly code = JWT_ERROR_CODES.INVALID_KEY_FOR_ALGORITHM;

	constructor(message?: string, description?: string, cause?: unknown) {
		super(JWT_ERROR_CODES.INVALID_KEY_FOR_ALGORITHM, message, description, cause);
	}
}


