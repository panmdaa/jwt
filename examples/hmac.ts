// Run: node --experimental-strip-types examples/hmac.ts

import { sign, verify } from "@panmdaa/jwt";

const secret = "replace-me-with-a-long-random-secret";

const token = sign({ role: "admin" }, secret, {
	alg: "HS256",
	expiresIn: "15m",
	issuer: "panmdaa",
	audience: "admin-api",
	subject: "user-123",
});

const payload = verify(token, secret, {
	algorithms: ["HS256"],
	issuer: "panmdaa",
	audience: "admin-api",
	subject: "user-123",
});

console.log({ token, payload });
