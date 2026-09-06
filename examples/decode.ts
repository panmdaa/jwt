// Run: node --experimental-strip-types examples/decode.ts

import { decode, sign } from "@panmdaa/jwt";

const token = sign(
	{ feature: "dashboard" },
	"replace-me-with-a-long-random-secret",
	{ alg: "HS256", expiresIn: "5m", issuer: "panmdaa" },
);

const decoded = decode(token);

console.log(decoded.header);
console.log(decoded.payload);
console.log(
	"Decode is for inspection only; call verify() before trusting claims.",
);
