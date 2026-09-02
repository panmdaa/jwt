import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAlgorithm } from "../../src/algorithms";
import { encodeBase64Url } from "../../src/encoding/base64url";
import { AlgorithmNotAllowed, AudienceMismatch, InvalidSignature, IssuerMismatch, MalformedToken, SubjectMismatch, TokenExpired, TokenNotYetValid } from "../../src/error/errors";
import { sign } from "../../src/jwt/sign";
import { verify } from "../../src/jwt/verify";

describe("verify", () => {
	it("rejects malformed tokens with missing or non-JSON segments", () => {
		expect(() => verify("abc", "secret", { algorithms: ["HS256"] })).toThrow(MalformedToken);
		expect(() => verify("a.b.c", "secret", { algorithms: ["HS256"] })).toThrow(MalformedToken);
	});

	it("rejects disallowed algorithms before verifying the key", () => {
		const token = sign({ sub: "user" }, "secret", { alg: "HS256" });
		expect(() => verify(token, "secret", { algorithms: ["HS384"] })).toThrow(AlgorithmNotAllowed);
		const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
		const nonePayload = Buffer.from(JSON.stringify({ sub: "user" })).toString("base64url");
		const noneToken = `${noneHeader}.${nonePayload}.Zm9v`;
		expect(() => verify(noneToken, "secret", { algorithms: ["HS256"] })).toThrow(AlgorithmNotAllowed);
	});

	it("uses the algorithm registry and verifies the signature in constant-time flow", () => {
		const key = "secret";
		const token = sign({ sub: "user" }, key, { alg: "HS256" });
		const verified = verify(token, key, { algorithms: ["HS256"] });
		expect(verified).toMatchObject({ sub: "user" });
		const implementation = getAlgorithm("HS256");
		expect(implementation.verify).toBeTypeOf("function");
	});

	it("rejects invalid signatures", () => {
		const token = sign({ sub: "user" }, "secret", { alg: "HS256" });
		const tampered = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
		expect(() => verify(tampered, "secret", { algorithms: ["HS256"] })).toThrow(InvalidSignature);
	});

	it("validates exp and nbf against clock tolerance", () => {
		const now = Math.floor(Date.now() / 1000);
		const expiredToken = sign({ exp: now - 5 }, "secret", { alg: "HS256" });
		expect(() => verify(expiredToken, "secret", { algorithms: ["HS256"] })).toThrow(TokenExpired);

		const futureToken = sign({ nbf: now + 300 }, "secret", { alg: "HS256" });
		expect(() => verify(futureToken, "secret", { algorithms: ["HS256"] })).toThrow(TokenNotYetValid);

		const tolerantToken = sign({ exp: now + 10, nbf: now + 10 }, "secret", { alg: "HS256", expiresIn: "1h" });
		expect(() => verify(tolerantToken, "secret", { algorithms: ["HS256"], clockTolerance: 20 })).not.toThrow();
	});

	it("validates audience claims when audience is configured", () => {
		const token = sign({ aud: "api" }, "secret", { alg: "HS256" });
		expect(() => verify(token, "secret", { algorithms: ["HS256"], audience: "web" })).toThrow(AudienceMismatch);
		expect(() => verify(token, "secret", { algorithms: ["HS256"], audience: ["web", "app"] })).toThrow(AudienceMismatch);
	});

	it("validates issuer claims when issuer is configured", () => {
		const token = sign({ iss: "issuer-a" }, "secret", { alg: "HS256" });
		expect(() => verify(token, "secret", { algorithms: ["HS256"], issuer: "issuer-b" })).toThrow(IssuerMismatch);
	});

	it("validates subject claims when subject is configured", () => {
		const token = sign({ sub: "user-a" }, "secret", { alg: "HS256" });
		expect(() => verify(token, "secret", { algorithms: ["HS256"], subject: "user-b" })).toThrow(SubjectMismatch);
	});

	it("returns the payload and optional complete object when requested", () => {
		const token = sign({ foo: "bar" }, "secret", { alg: "HS256" });
		const payload = verify(token, "secret", { algorithms: ["HS256"] });
		const complete = verify(token, "secret", { algorithms: ["HS256"], complete: true });
		expect(payload).toMatchObject({ foo: "bar" });
		expect(complete).toMatchObject({ payload: { foo: "bar" } });
		expect(complete).toHaveProperty("header");
		expect(complete).toHaveProperty("signature");
	});

	it("rejects tokens exceeding maxTokenLength before any parsing", () => {
		const longToken = `${"a".repeat(5000)}.${"b".repeat(5000)}.${"c".repeat(5000)}`;
		expect(() => verify(longToken, "secret", { algorithms: ["HS256"], maxTokenLength: 2048 })).toThrow(MalformedToken);
	});

	it("supports RSA and ECDSA verification paths with explicit algorithm allowlists", () => {
		const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const rsaToken = sign({ sub: "rsa-user" }, privateKey, { alg: "RS256" });
		expect(verify(rsaToken, publicKey, { algorithms: ["RS256"] })).toMatchObject({ sub: "rsa-user" });

		const { privateKey: ecdsaPrivate, publicKey: ecdsaPublic } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
		const ecdsaToken = sign({ sub: "ec-user" }, ecdsaPrivate, { alg: "ES256" });
		expect(verify(ecdsaToken, ecdsaPublic, { algorithms: ["ES256"] })).toMatchObject({ sub: "ec-user" });
	});
});
