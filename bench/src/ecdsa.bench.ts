import { sign, verify } from "../../src/index";
import { benchmarkOperation, getEcdsaKeys, ECDSA_ALGORITHMS } from "./shared";

const ecdsaKeys = getEcdsaKeys();

console.log("ECDSA benchmark");
for (const algorithm of ECDSA_ALGORITHMS) {
	const keyPair = ecdsaKeys[algorithm];
	const payload = { sub: "bench-user", foo: "bar" };
	const token = sign(payload, keyPair.privateKey, { alg: algorithm });
	benchmarkOperation(`sign ${algorithm}`, () => {
		sign(payload, keyPair.privateKey, { alg: algorithm });
	}, 400);
	benchmarkOperation(`verify ${algorithm}`, () => {
		verify(token, keyPair.publicKey, { algorithms: [algorithm] });
	}, 400);
}
