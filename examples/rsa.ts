// Run: node --experimental-strip-types examples/rsa.ts

import { generateKeyPairSync } from "node:crypto";
import { sign, verify } from "@panmdaa/jwt";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});

const token = sign({ scope: ["read:reports"] }, privateKey, {
	alg: "RS256",
	expiresIn: "1h",
	issuer: "panmdaa",
	audience: "reports-api",
});

const payload = verify(token, publicKey, {
	algorithms: ["RS256"],
	issuer: "panmdaa",
	audience: "reports-api",
});

console.log(payload);
