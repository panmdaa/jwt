import { sign, verify } from "../../src/index";
import { benchmarkOperation, getHmacKeys, HMAC_ALGORITHMS } from "./shared";

const hmacKeys = getHmacKeys();

console.log("HMAC benchmark");
for (const algorithm of HMAC_ALGORITHMS) {
	const key = hmacKeys[algorithm];
	const payload = { sub: "bench-user", foo: "bar" };
	const token = sign(payload, key, { alg: algorithm });
	benchmarkOperation(`sign ${algorithm}`, () => {
		sign(payload, key, { alg: algorithm });
	}, 2000);
	benchmarkOperation(`verify ${algorithm}`, () => {
		verify(token, key, { algorithms: [algorithm] });
	}, 2000);
}
