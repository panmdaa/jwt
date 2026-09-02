import { describe, expect, it } from "vitest";
import { sign } from "../../src/jwt/sign";

const secret = "super-secret";

describe("sign", () => {
	it("creates a 3-part JWT with valid header and payload", () => {
		const token = sign({ sub: "user_123", foo: "bar" }, secret, { alg: "HS256" });
		const parts = token.split(".");

		expect(parts).toHaveLength(3);
		const [headerSegment, payloadSegment] = parts;
		const header = JSON.parse(Buffer.from(headerSegment, "base64url").toString("utf8"));
		const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));

		expect(header).toMatchObject({ alg: "HS256", typ: "JWT" });
		expect(payload).toMatchObject({ sub: "user_123", foo: "bar" });
		expect(payload.iat).toEqual(expect.any(Number));
	});

	it("computes time claims via duration parsing and automatic iat", () => {
		const before = Math.floor(Date.now() / 1000);
		const token = sign({ foo: "bar" }, secret, {
			alg: "HS256",
			expiresIn: "2h",
			notBefore: "30s",
		});
		const [, payloadSegment] = token.split(".");
		const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
		const after = Math.floor(Date.now() / 1000);

		expect(payload.iat).toBeGreaterThanOrEqual(before);
		expect(payload.iat).toBeLessThanOrEqual(after);
		expect(payload.exp).toBe(payload.iat + 7200);
		expect(payload.nbf).toBe(payload.iat + 30);
	});

	it("prefers explicit options over payload claims", () => {
		const token = sign(
			{ iss: "manual-issuer", sub: "manual-subject", aud: "manual-audience", exp: 1, iat: 9 },
			secret,
			{
				alg: "HS256",
				issuer: "option-issuer",
				audience: ["aud-1", "aud-2"],
				subject: "option-subject",
				expiresIn: "1h",
				addIssuedAt: false,
			},
		);
		const [, payloadSegment] = token.split(".");
		const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));

		expect(payload.iss).toBe("option-issuer");
		expect(payload.sub).toBe("option-subject");
		expect(payload.aud).toEqual(["aud-1", "aud-2"]);
		expect(payload.exp).toBeGreaterThan(1);
		expect(payload).not.toHaveProperty("iat");
	});
});
