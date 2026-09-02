import { sign, verify } from "../../src/index";
import { benchmarkOperation, getRsaKeys, RSA_ALGORITHMS } from "./shared";

const rsaKeys = getRsaKeys();

console.log("RSA benchmark");
for (const algorithm of RSA_ALGORITHMS) {
	const keyPair = rsaKeys[algorithm];
	const payload = { sub: "bench-user", foo: "bar" };
	const token = sign(payload, keyPair.privateKey, { alg: algorithm });
	benchmarkOperation(`sign ${algorithm}`, () => {
		sign(payload, keyPair.privateKey, { alg: algorithm });
	}, 400);
	benchmarkOperation(`verify ${algorithm}`, () => {
		verify(token, keyPair.publicKey, { algorithms: [algorithm] });
	}, 400);
}
