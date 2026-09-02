import { describe, expect, it } from "vitest";
import { sign } from "../../src/jwt/sign";
import { jwtAuth, JWT_CONTEXT_STATE_KEY } from "../../src/middleware";
import { MalformedToken } from "../../src/error/errors";

describe("jwtAuth middleware", () => {
	it("accepts a valid token and stores the payload in context.state", async () => {
		const token = sign({ sub: "user-123", foo: "bar" }, "secret", { alg: "HS256" });
		const context = {
			headers: {
				get: (name: string) => (name === "Authorization" ? `Bearer ${token}` : undefined),
			},
			state: {},
		};
		const next = async () => "ok";

		const middleware = jwtAuth({ key: "secret", algorithms: ["HS256"] });
		const result = await middleware(context as any, next);

		expect(result).toBe("ok");
		expect(context.state[JWT_CONTEXT_STATE_KEY]).toMatchObject({ sub: "user-123", foo: "bar" });
	});

	it("throws when no token is present", async () => {
		const context = {
			headers: {
				get: () => undefined,
			},
			state: {},
		};
		const next = async () => "ok";
		const middleware = jwtAuth({ key: "secret", algorithms: ["HS256"] });

		await expect(middleware(context as any, next)).rejects.toThrow(MalformedToken);
	});

	it("throws when the token is invalid or expired", async () => {
		const expiredToken = sign({ sub: "user-123", exp: Math.floor(Date.now() / 1000) - 5 }, "secret", { alg: "HS256" });
		const context = {
			headers: {
				get: () => `Bearer ${expiredToken}`,
			},
			state: {},
		};
		const next = async () => "ok";
		const middleware = jwtAuth({ key: "secret", algorithms: ["HS256"] });

		await expect(middleware(context as any, next)).rejects.toThrow();
	});
});
