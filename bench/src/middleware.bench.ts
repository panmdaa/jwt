import { bench, describe } from "vitest";
import { compileHandler, type Handler } from "../../src/http/handler";

const makeMiddleware = (): Handler<{ value: number }> => (ctx, next) => {
	ctx.value++;
	next();
};

const final: Handler<{ value: number }> = (ctx) => {
	ctx.value;
};

const compiled1 = compileHandler(final);
const compiled3 = compileHandler(makeMiddleware(), makeMiddleware(), final);
const compiled5 = compileHandler(
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	final,
);
const compiled10 = compileHandler(
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	makeMiddleware(),
	final,
);

const base: Handler<{ value: number }> = (ctx) => {
	ctx.value;
};

const ctx = { value: 0 };

describe("handler chain (compileHandler)", () => {
	bench("single handler", () => {
		compiled1(ctx, () => {});
	});

	bench("3-handler chain", () => {
		compiled3(ctx, () => {});
	});

	bench("5-handler chain", () => {
		compiled5(ctx, () => {});
	});

	bench("10-handler chain", () => {
		compiled10(ctx, () => {});
	});

	bench("direct call baseline", () => {
		base(ctx, () => {});
	});
});
