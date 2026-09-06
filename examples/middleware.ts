// Run: node --experimental-strip-types examples/middleware.ts

import { sign } from "@panmdaa/jwt";
import { jwtAuth, JWT_CONTEXT_STATE_KEY } from "@panmdaa/jwt/middleware";

const secret = "replace-me-with-a-long-random-secret";
const token = sign({ role: "admin" }, secret, {
	alg: "HS256",
	expiresIn: "15m",
	issuer: "panmdaa",
});

const context = {
	headers: new Headers({ Authorization: `Bearer ${token}` }),
	state: {},
};

const authenticate = jwtAuth({
	key: secret,
	algorithms: ["HS256"],
	issuer: "panmdaa",
});

await authenticate(context, () => {
	console.log(context.state[JWT_CONTEXT_STATE_KEY]);
});
