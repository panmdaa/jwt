import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Server } from "../../../src/http/server/server";
import { Router } from "../../../src/router/router";

const servers: Server[] = [];

function listen(server: Server): Promise<number> {
	servers.push(server);
	return new Promise((resolve) => {
		server.listen(0);
		waitForAddress(server, resolve);
	});
}

function waitForAddress(server: Server, resolve: (port: number) => void): void {
	const address = server.address();
	if (address) {
		resolve((address as AddressInfo).port);
		return;
	}
	setTimeout(() => waitForAddress(server, resolve), 5);
}

function httpSend(
	port: number,
	path: string,
	method: string,
	body?: string,
	headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest(
			{ port, path, method, headers },
			(res) => {
				const chunks: string[] = [];
				res.on("data", (chunk) => chunks.push(String(chunk)));
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						body: chunks.join(""),
						headers: res.headers as Record<string, string>,
					}),
				);
			},
		);
		req.on("error", reject);
		if (body) req.write(body);
		req.end();
	});
}

afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

describe("Server routing integration", () => {
	it("mounts a child router under a prefix", async () => {
		const server = new Server();
		const api = new Router();
		api.get("/users", ({ response }) => response.json({ users: [] }));
		server.router("/api", api);
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/api/users", "GET");

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ users: [] });
	});

	it("mounts a router at the root with the bare overload", async () => {
		const server = new Server();
		const api = new Router();
		api.get("/ping", ({ response }) => response.text("pong"));
		server.router(api);
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/ping", "GET");

		expect(status).toBe(200);
		expect(body).toBe("pong");
	});

	it("groups routes under a shared prefix", async () => {
		const server = new Server();
		server.group("/v1", (router) => {
			router.get("/status", ({ response }) => response.text("ok"));
		});
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/v1/status", "GET");

		expect(status).toBe(200);
		expect(body).toBe("ok");
	});

	it("registers one handler for every HTTP method with all()", async () => {
		const server = new Server();
		server.all("/everything", ({ response }) => response.text("matched"));
		const port = await listen(server);

		for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
			const { status, body } = await httpSend(port, "/everything", method);
			expect(status).toBe(200);
			if (method !== "HEAD") expect(body).toBe("matched");
		}
	});

	it("serves PUT, PATCH and DELETE with request bodies", async () => {
		const server = new Server();
		server.put("/items/:id", async ({ body, params, response }) => {
			const data = await body.json();
			response.json({ id: params.id, ...(data as object) });
		});
		server.patch("/items/:id", async ({ body, response }) => {
			response.text(`patched:${JSON.stringify(await body.json())}`);
		});
		server.delete("/items/:id", ({ params, response }) => {
			response.json({ deleted: params.id });
		});
		const port = await listen(server);

		const put = await httpSend(
			port,
			"/items/7",
			"PUT",
			JSON.stringify({ name: "widget" }),
			{ "content-type": "application/json" },
		);
		expect(put.status).toBe(200);
		expect(JSON.parse(put.body)).toEqual({ id: "7", name: "widget" });

		const patch = await httpSend(port, "/items/7", "PATCH", JSON.stringify({ a: 1 }), {
			"content-type": "application/json",
		});
		expect(patch.status).toBe(200);
		expect(patch.body).toBe("patched:{\"a\":1}");

		const del = await httpSend(port, "/items/7", "DELETE");
		expect(del.status).toBe(200);
		expect(JSON.parse(del.body)).toEqual({ deleted: "7" });
	});

	it("supports the QUERY pseudo-method for body-capable routes", async () => {
		const server = new Server();
		server.query("/report", async ({ body, response }) => {
			response.json(await body.json());
		});
		const port = await listen(server);

		const { status, body } = await httpSend(
			port,
			"/report",
			"QUERY",
			JSON.stringify({ filters: ["a"] }),
			{ "content-type": "application/json" },
		);

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ filters: ["a"] });
	});

	it("matches optional params and wildcards", async () => {
		const server = new Server();
		server.get("/files/:path?", ({ params, response }) =>
			response.json(params),
		);
		server.get("/static/*", ({ params, wildcard, response }) =>
			response.json({ params, wildcard }),
		);
		const port = await listen(server);

		const withParam = await httpSend(port, "/files/app.css", "GET");
		expect(JSON.parse(withParam.body)).toEqual({ path: "app.css" });

		const without = await httpSend(port, "/files", "GET");
		expect(JSON.parse(without.body)).toEqual({});

		const star = await httpSend(port, "/static/css/app.css", "GET");
		expect(JSON.parse(star.body)).toEqual({
			params: { "*": "css/app.css" },
			wildcard: "css/app.css",
		});
	});
});

describe("Server middleware integration", () => {
	it("applies middleware registered before the route", async () => {
		const server = new Server();
		const seen: string[] = [];
		server.use((_ctx, next) => {
			seen.push("before");
			next();
		});
		server.get("/hi", ({ response }) => {
			seen.push("handler");
			response.text("ok");
		});
		const port = await listen(server);

		const { status } = await httpSend(port, "/hi", "GET");

		expect(status).toBe(200);
		expect(seen).toEqual(["before", "handler"]);
	});

	it("runs middleware for every verb on the route", async () => {
		const server = new Server();
		let count = 0;
		server.use((_ctx, next) => {
			count += 1;
			next();
		});
		server.all("/hit", ({ response }) => response.text("ok"));
		const port = await listen(server);

		await httpSend(port, "/hit", "GET");
		await httpSend(port, "/hit", "POST");
		await httpSend(port, "/hit", "DELETE");

		expect(count).toBe(3);
	});

	it("does not apply middleware to routes registered before it", async () => {
		const server = new Server();
		const seen: string[] = [];
		server.get("/early", ({ response }) => {
			seen.push("handler");
			response.text("ok");
		});
		server.use((_ctx, next) => {
			seen.push("mw");
			next();
		});
		const port = await listen(server);

		const { status } = await httpSend(port, "/early", "GET");

		expect(status).toBe(200);
		expect(seen).toEqual(["handler"]);
	});

	it("short-circuits when middleware does not call next", async () => {
		const server = new Server();
		const seen: string[] = [];
		server.use((_ctx) => {
			seen.push("guard");
		});
		server.get("/blocked", ({ response }) => {
			seen.push("handler");
			response.text("never");
		});
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/blocked", "GET");

		expect(seen).toEqual(["guard"]);
		expect(status).toBe(200);
		expect(body).toBe("");
	});

	it("lets middleware mutate the shared state object", async () => {
		const server = new Server();
		server.use((ctx, next) => {
			ctx.state.user = "alice";
			next();
		});
		server.get("/who", ({ state, response }) =>
			response.json(state as object),
		);
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/who", "GET");

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ user: "alice" });
	});
});

describe("Server context getters", () => {
	it("parses cookies from the Cookie header", async () => {
		const server = new Server();
		server.get("/cookies", ({ cookies, response }) =>
			response.json(cookies),
		);
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/cookies", "GET", undefined, {
			cookie: "theme=dark; session=abc123",
		});

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ theme: "dark", session: "abc123" });
	});

	it("parses duplicate query params into arrays", async () => {
		const server = new Server();
		server.get("/q", ({ query, response }) => response.json(query));
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/q?tag=a&tag=b&tag=c", "GET");

		expect(status).toBe(200);
		expect(JSON.parse(body)).toEqual({ tag: ["a", "b", "c"] });
	});

	it("reports host, ip and origin from the request", async () => {
		const server = new Server();
		server.get("/meta", ({ host, ip, origin, response }) =>
			response.json({ host, ip, origin }),
		);
		const port = await listen(server);

		const { status, body } = await httpSend(port, "/meta", "GET", undefined, {
			host: "example.test",
		});

		expect(status).toBe(200);
		const meta = JSON.parse(body);
		expect(meta.host).toBe("example.test");
		expect(meta.origin).toBe(`http://example.test`);
		expect(meta.ip).toBeTypeOf("string");
	});
});
