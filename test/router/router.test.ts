import { describe, expect, it } from "vitest";
import type { Handler } from "../../src/http/handler/types";
import { RadixTree } from "../../src/router/radix-tree/radix-tree";
import type { FindResult } from "../../src/router/radix-tree/types";
import { Router } from "../../src/router/router";

class TestRouter extends Router {
	match<P extends `/${string}`>(
		method: string,
		path: P,
	): FindResult<Handler<any>> | undefined {
		return super.find(method, path);
	}
}

describe("Router", () => {
	it("registers a route for a single method", () => {
		const router = new TestRouter();
		router.get("/users", () => undefined);

		expect(router.match("GET", "/users")).toBeDefined();
		expect(router.match("POST", "/users")).toBeUndefined();
	});

	it("all registers the handler for every HTTP method", () => {
		const router = new TestRouter();
		router.all("/health", () => undefined);

		for (const method of [
			"GET",
			"POST",
			"PUT",
			"DELETE",
			"PATCH",
			"OPTIONS",
			"HEAD",
			"QUERY",
		])
			expect(router.match(method, "/health")).toBeDefined();
	});

	it("query registers under the QUERY method and exposes the body", async () => {
		const router = new TestRouter();
		let body: unknown;

		router.query<"/search", { q: string }>("/search", async (ctx) => {
			body = await ctx.body.json();
		});

		const found = router.match("QUERY", "/search");
		expect(found).toBeDefined();
		await found?.store(
			{ body: { json: async () => ({ q: "panmdaa" }) } },
			() => undefined,
		);

		expect(body).toEqual({ q: "panmdaa" });
		expect(router.match("GET", "/search")).toBeUndefined();
	});

	it("executes the compiled handler chain with ctx and next", async () => {
		const router = new TestRouter();
		const events: string[] = [];

		router.get(
			"/users",
			(_ctx, next) => {
				events.push("mw");
				next();
			},
			() => {
				events.push("controller");
			},
		);

		const found = router.match("GET", "/users");
		expect(found).toBeDefined();
		await found?.store({}, () => undefined);

		expect(events).toEqual(["mw", "controller"]);
	});

	it("group applies the prefix to its routes", () => {
		const router = new TestRouter();
		router.group("/api", (r) => {
			r.get("/users", () => undefined);
			r.post("/users", () => undefined);
		});

		expect(router.match("GET", "/api/users")).toBeDefined();
		expect(router.match("POST", "/api/users")).toBeDefined();
		expect(router.match("GET", "/users")).toBeUndefined();
	});

	it("supports nested groups", () => {
		const router = new TestRouter();
		router.group("/api", (r) => {
			r.group("/v1", (r2) => {
				r2.get("/users", () => undefined);
			});
		});

		expect(router.match("GET", "/api/v1/users")).toBeDefined();
	});

	it("mounts a router without an extra prefix", () => {
		const child = new TestRouter();
		child.get("/users", () => undefined);

		const parent = new TestRouter();
		parent.router(child);

		expect(parent.match("GET", "/users")).toBeDefined();
	});

	it("mounts a router with an extra prefix combined with the child paths", () => {
		const child = new TestRouter();
		child.get("/users", () => undefined);

		const parent = new TestRouter();
		parent.router("/api", child);

		expect(parent.match("GET", "/api/users")).toBeDefined();
		expect(parent.match("GET", "/users")).toBeUndefined();
	});

	it("combines parent prefix, extra prefix and child prefix", () => {
		const child = new TestRouter("/v1");
		child.get("/users", () => undefined);

		const parent = new TestRouter("/api");
		parent.router("/internal", child);

		expect(parent.match("GET", "/api/internal/v1/users")).toBeDefined();
	});

	it("routes registered on a prefixed router include the prefix", () => {
		const router = new TestRouter("/api");
		router.get("/users", () => undefined);

		expect(router.match("GET", "/api/users")).toBeDefined();
		expect(router.match("GET", "/users")).toBeUndefined();
	});

	it("methods are chainable", () => {
		const router = new TestRouter();

		const result = router
			.get("/a", () => undefined)
			.post("/b", () => undefined)
			.group("/c", (r) => r.get("/d", () => undefined));

		expect(result).toBeInstanceOf(Router);
		expect(router.match("GET", "/a")).toBeDefined();
		expect(router.match("POST", "/b")).toBeDefined();
		expect(router.match("GET", "/c/d")).toBeDefined();
	});

	it("matches a route when the url has a query string", () => {
		const router = new TestRouter();
		router.get("/users", () => undefined);

		const found = router.match("GET", "/users?page=1&limit=10");

		expect(found).toBeDefined();
		expect(found?.search).toBe("page=1&limit=10");
	});

	it("matches a route with params when the url has a query string", () => {
		const router = new TestRouter();
		router.get("/users/:id", () => undefined);

		const found = router.match("GET", "/users/42?full=1");

		expect(found).toBeDefined();
		expect(found?.params).toEqual({ id: "42" });
		expect(found?.search).toBe("full=1");
	});

	it("returns an empty search when the url has no query string", () => {
		const router = new TestRouter();
		router.get("/users", () => undefined);

		const found = router.match("GET", "/users");

		expect(found?.search).toBe("");
	});

	it("runs global middlewares registered with use before the handler", async () => {
		const router = new TestRouter();
		const events: string[] = [];

		router
			.use((_ctx, next) => {
				events.push("logger");
				next();
			})
			.get("/users", () => {
				events.push("controller");
			});

		const found = router.match("GET", "/users");
		await found?.store({}, () => undefined);

		expect(events).toEqual(["logger", "controller"]);
	});

	it("runs global middlewares on every route", async () => {
		const router = new TestRouter();
		const events: string[] = [];

		router.use((_ctx, next) => {
			events.push("auth");
			next();
		});
		router.get("/a", () => {
			events.push("a");
		});
		router.post("/b", () => {
			events.push("b");
		});

		await router.match("GET", "/a")?.store({}, () => undefined);
		await router.match("POST", "/b")?.store({}, () => undefined);

		expect(events).toEqual(["auth", "a", "auth", "b"]);
	});

	it("runs multiple global middlewares in registration order", async () => {
		const router = new TestRouter();
		const events: string[] = [];

		router
			.use((_ctx, next) => {
				events.push("m1");
				next();
			})
			.use((_ctx, next) => {
				events.push("m2");
				next();
			})
			.get("/users", () => {
				events.push("controller");
			});

		await router.match("GET", "/users")?.store({}, () => undefined);

		expect(events).toEqual(["m1", "m2", "controller"]);
	});

	it("short-circuits the chain when a global middleware does not call next", async () => {
		const router = new TestRouter();
		const events: string[] = [];

		router.use((_ctx, _next) => {
			events.push("blocked");
		});
		router.get("/users", () => {
			events.push("controller");
		});

		await router.match("GET", "/users")?.store({}, () => undefined);

		expect(events).toEqual(["blocked"]);
	});

	it("applies global middlewares to grouped routes", async () => {
		const router = new TestRouter();
		const events: string[] = [];

		router.use((_ctx, next) => {
			events.push("logger");
			next();
		});
		router.group("/api", (r) => {
			r.get("/users", () => {
				events.push("users");
			});
		});

		await router.match("GET", "/api/users")?.store({}, () => undefined);

		expect(events).toEqual(["logger", "users"]);
	});

	it("RadixTree matches a loose path with a query string", () => {
		const tree = new RadixTree<number>({ loosePath: true });
		tree.add("GET", "/users", 1);

		const found = tree.find("GET", "/users/?page=1");

		expect(found).toBeDefined();
		expect(found?.search).toBe("page=1");
	});

	it("RadixTree.methods lists every method matching a url before any find", () => {
		const tree = new RadixTree<number>();
		tree.add("GET", "/static", 1);
		tree.add("POST", "/users/:id", 2);
		tree.add("DELETE", "/files/*", 3);

		expect(tree.methods("/static")).toEqual(["GET"]);
		expect(tree.methods("/users/42")).toEqual(["POST"]);
		expect(tree.methods("/files/a/b")).toEqual(["DELETE"]);
		expect(tree.methods("/nope")).toEqual([]);
	});

	it("RadixTree.methods dedupes static and dynamic routes of the same method", () => {
		const tree = new RadixTree<number>();
		tree.add("GET", "/users", 1);
		tree.add("GET", "/users/:id", 2);

		expect(tree.methods("/users")).toEqual(["GET"]);
		expect(tree.methods("/users/42")).toEqual(["GET"]);
	});
});
