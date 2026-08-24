import { describe, expect, it } from "vitest";
import { compileHandler } from "../../../src/http/handler/compile";
import type { Handler } from "../../../src/http/handler/types";

interface TestState {
	events: string[];
	user?: string;
}

function createContext(user?: string): TestState {
	return { events: [], user };
}

describe("compileHandler", () => {
	it("compiles handlers into a single function", () => {
		const compiled = compileHandler<TestState>(() => undefined);
		expect(typeof compiled).toBe("function");
	});

	it("runs middlewares and controller in registration order", async () => {
		const ctx = createContext();

		const compiled = compileHandler<TestState>(
			(c, next) => {
				c.events.push("mw1");
				next();
			},
			(c, next) => {
				c.events.push("mw2");
				next();
			},
			(c) => {
				c.events.push("controller");
			},
		);

		await compiled(ctx, () => undefined);

		expect(ctx.events).toEqual(["mw1", "mw2", "controller"]);
	});

	it("passes next() as a second argument when there is more than one handler", async () => {
		const ctx = createContext();
		let sawNext: unknown;

		const compiled = compileHandler<TestState>(
			(_c, next) => {
				sawNext = next;
				next();
			},
			(c) => {
				c.events.push("controller");
			},
		);

		await compiled(ctx, () => undefined);

		expect(typeof sawNext).toBe("function");
	});

	it("does not create next() for a single handler", async () => {
		const ctx = createContext();
		let sawNext: unknown;

		const handler: Handler<TestState> = (c, next) => {
			sawNext = next;
			c.events.push("controller");
		};

		await compileHandler<TestState>(handler)(ctx);

		expect(sawNext).toBeUndefined();
	});

	it("stops the chain when next() is not called", async () => {
		const ctx = createContext();

		const compiled = compileHandler<TestState>(
			(c, next) => {
				c.events.push("mw1");
				next();
			},
			(c) => {
				c.events.push("mw2");
			},
			(c) => {
				c.events.push("controller");
			},
		);

		await compiled(ctx, () => undefined);

		expect(ctx.events).toEqual(["mw1", "mw2"]);
	});

	it("supports conditional middleware short-circuit", async () => {
		const anonymous = createContext();
		const authenticated = createContext("ana");

		const compiled = compileHandler<TestState>(
			(c, next) => {
				if (!c.user) return;
				next();
			},
			(c) => {
				c.events.push(`controller sees ${c.user}`);
			},
		);

		await compiled(anonymous, () => undefined);
		expect(anonymous.events).toEqual([]);

		await compiled(authenticated, () => undefined);
		expect(authenticated.events).toEqual(["controller sees ana"]);
	});

	it("awaits async handlers before advancing", async () => {
		const ctx = createContext();

		const compiled = compileHandler<TestState>(
			async (c, next) => {
				c.events.push("before");
				await Promise.resolve();
				next();
			},
			(c) => {
				c.events.push("controller");
			},
		);

		await compiled(ctx, () => undefined);

		expect(ctx.events).toEqual(["before", "controller"]);
	});

	it("reuses the compiled function across independent requests", async () => {
		const compiled = compileHandler<TestState>(
			(c, next) => {
				c.events.push("mw");
				next();
			},
			(c) => {
				c.events.push("controller");
			},
		);

		const first = createContext();
		const second = createContext();

		await compiled(first, () => undefined);
		await compiled(second, () => undefined);

		expect(first.events).toEqual(["mw", "controller"]);
		expect(second.events).toEqual(["mw", "controller"]);
	});

	it("handles a single controller without middlewares", async () => {
		const ctx = createContext();

		const compiled = compileHandler<TestState>((c) => {
			c.events.push("controller");
		});

		await compiled(ctx);

		expect(ctx.events).toEqual(["controller"]);
	});

	it("propagates a synchronous throw from a single handler", () => {
		const compiled = compileHandler<TestState>(() => {
			throw new Error("boom");
		});

		expect(() => compiled(createContext())).toThrow("boom");
	});

	it("returns a rejected promise when a middleware chain throws", async () => {
		const compiled = compileHandler<TestState>(
			(c, next) => {
				c.events.push("mw");
				next();
			},
			() => {
				throw new Error("boom");
			},
		);

		await expect(compiled(createContext())).rejects.toThrow("boom");
	});

	it("handles next() called asynchronously after await", async () => {
		const ctx = createContext();

		const compiled = compileHandler<TestState>(
			async (c, next) => {
				await Promise.resolve();
				c.events.push("async-mw");
				next();
			},
			(c) => {
				c.events.push("controller");
			},
		);

		await compiled(ctx, () => undefined);

		expect(ctx.events).toEqual(["async-mw", "controller"]);
	});

	it("forwards to the external next when the chain completes", async () => {
		const ctx = createContext();
		let externalCalled = false;

		const compiled = compileHandler<TestState>(
			(c, next) => {
				c.events.push("mw");
				next();
			},
			(c, next) => {
				c.events.push("controller");
				next();
			},
		);

		await compiled(ctx, () => {
			externalCalled = true;
		});

		expect(ctx.events).toEqual(["mw", "controller"]);
		expect(externalCalled).toBe(true);
	});
});
