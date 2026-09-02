/**
 * Standard JWT claims supported by the library.
 *
 * These fields are the common claims used by JWTs. Custom claims can be added
 * by intersecting extra properties with this type in application code.
 */
export interface StandardJwtClaims {
	/** Issuer claim. */
	iss?: string;
	/** Subject claim. */
	sub?: string;
	/** Audience claim, either a single value or a list. */
	aud?: string | string[];
	/** Expiration time claim, expressed in Unix seconds. */
	exp?: number;
	/** Not-before claim, expressed in Unix seconds. */
	nbf?: number;
	/** Issued-at claim, expressed in Unix seconds. */
	iat?: number;
	/** JWT ID claim. */
	jti?: string;
}

/**
 * JWT payload type with standard and custom claims.
 */
export type JwtPayload<T extends Record<string, unknown> = Record<string, unknown>> = StandardJwtClaims & T;

/**
 * JWS header object.
 */
export interface JwsHeader {
	alg: import("./algorithms").Algorithm;
	typ?: "JWT";
	kid?: string;
	[key: string]: unknown;
}

/**
 * Options accepted by the signing helper.
 */
export interface SignOptions {
	alg: import("./algorithms").Algorithm;
	kid?: string;
	expiresIn?: number | string;
	notBefore?: number | string;
	issuer?: string;
	audience?: string | string[];
	subject?: string;
	jwtid?: string;
	addIssuedAt?: boolean;
}

/**
 * Options accepted by the verification helper.
 */
export interface VerifyOptions {
	algorithms: import("./algorithms").Algorithm[];
	issuer?: string;
	audience?: string | string[];
	subject?: string;
	clockTolerance?: number;
	maxTokenLength?: number;
	complete?: boolean;
}
