import { describe, expect, it } from "vitest";
import {
	MalformedToken,
	InvalidSignature,
	AlgorithmNotAllowed,
	AlgorithmNone,
	TokenExpired,
	TokenNotYetValid,
	AudienceMismatch,
	IssuerMismatch,
	SubjectMismatch,
	InvalidKeyForAlgorithm,
} from "../../src/error/errors";
import {
	JwtError,
	isJwtError,
	JWT_ERROR_CODES,
	JWT_ERROR_MESSAGES,
} from "../../src/error/jwt-error";

describe("JwtError", () => {
	it("carries the code, message and description", () => {
		const error = new JwtError(
			JWT_ERROR_CODES.TOKEN_EXPIRED,
			"Token expired at 2024-01-01",
			"exp claim out of range",
		);

		expect(error.code).toBe(JWT_ERROR_CODES.TOKEN_EXPIRED);
		expect(error.message).toBe("Token expired at 2024-01-01");
		expect(error.description).toBe("exp claim out of range");
		expect(error.name).toBe("JwtError");
	});

	it("falls back to the standard message when no message is given", () => {
		const error = new JwtError(JWT_ERROR_CODES.INVALID_SIGNATURE);

		expect(error.message).toBe(JWT_ERROR_MESSAGES[JWT_ERROR_CODES.INVALID_SIGNATURE]);
	});

	it("isJwtError narrows JwtError instances only", () => {
		expect(isJwtError(new TokenExpired())).toBe(true);
		expect(isJwtError(new Error("nope"))).toBe(false);
		expect(isJwtError(null)).toBe(false);
	});

	it("exposes a standard message for every error code", () => {
		const codes = Object.values(JWT_ERROR_CODES);

		for (const code of codes) {
			expect(JWT_ERROR_MESSAGES[code as keyof typeof JWT_ERROR_MESSAGES]).toBeTypeOf(
				"string",
			);
		}
	});
});

describe("error classes", () => {
	it("every exported class is a JwtError subclass", () => {
		const errors = [
			new MalformedToken(),
			new InvalidSignature(),
			new AlgorithmNotAllowed(),
			new AlgorithmNone(),
			new TokenExpired(),
			new TokenNotYetValid(),
			new AudienceMismatch(),
			new IssuerMismatch(),
			new SubjectMismatch(),
			new InvalidKeyForAlgorithm(),
		];

		for (const error of errors) {
			expect(error).toBeInstanceOf(JwtError);
			expect(error).toBeInstanceOf(Error);
		}
	});

	it("generated classes report their real class name", () => {
		expect(new MalformedToken().name).toBe("MalformedToken");
		expect(new TokenExpired().name).toBe("TokenExpired");
		expect(new InvalidSignature().name).toBe("InvalidSignature");
	});

	it("generated classes accept message, description and cause", () => {
		const cause = new Error("underlying crypto error");
		const error = new InvalidSignature("HMAC mismatch", "header.payload vs header.payload.sig", cause);

		expect(error.message).toBe("HMAC mismatch");
		expect(error.description).toBe("header.payload vs header.payload.sig");
		expect(error.cause).toBe(cause);
	});

	it("static classes expose their code", () => {
		expect(MalformedToken.code).toBe(JWT_ERROR_CODES.MALFORMED_TOKEN);
		expect(TokenExpired.code).toBe(JWT_ERROR_CODES.TOKEN_EXPIRED);
		expect(InvalidKeyForAlgorithm.code).toBe(JWT_ERROR_CODES.INVALID_KEY_FOR_ALGORITHM);
	});
});
