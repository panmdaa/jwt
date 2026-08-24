import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Server } from "../../../src/http/server/server";
import { cors } from "../../../src/middleware/cors";
import { securityHeaders } from "../../../src/middleware/security-headers";

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
	headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest({ port, path, method, headers }, (res) => {
			const chunks: Buffer[] = [];
			res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
			res.on("end", () =>
				resolve({
					status: res.statusCode ?? 0,
					body: Buffer.concat(chunks).toString("utf8"),
					headers: res.headers as Record<string, string>,
				}),
			);
		});
		req.on("error", reject);
		req.end();
	});
}

afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

describe("cors middleware", () => {
	it("echoes the request origin when allowOrigin is true", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: true }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { status, headers } = await httpSend(port, "/data", "GET", {
			origin: "https://app.example.com",
		});

		expect(status).toBe(200);
		expect(headers["access-control-allow-origin"]).toBe(
			"https://app.example.com",
		);
		expect(headers.vary).toContain("origin");
	});

	it("allows an explicit origin string", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: "https://trusted.example.com" }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://trusted.example.com",
		});

		expect(headers["access-control-allow-origin"]).toBe(
			"https://trusted.example.com",
		);
	});

	it("matches an allowlist array", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: ["https://a.example.com"] }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const allowed = await httpSend(port, "/data", "GET", {
			origin: "https://a.example.com",
		});
		expect(allowed.headers["access-control-allow-origin"]).toBe(
			"https://a.example.com",
		);

		const blocked = await httpSend(port, "/data", "GET", {
			origin: "https://evil.example.com",
		});
		expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("matches an allowOrigin RegExp", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: /^https:\/\/.+\.example\.com$/ }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://sub.example.com",
		});

		expect(headers["access-control-allow-origin"]).toBe(
			"https://sub.example.com",
		);
	});

	it("omits the origin header when allowOrigin is false", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: false }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://app.example.com",
		});

		expect(headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("short-circuits preflight OPTIONS with 204 and never hits the handler", async () => {
		const server = new Server();
		let hit = false;
		server.use(
			cors({
				allowOrigin: "*",
				allowMethods: ["GET", "POST"],
				allowHeaders: ["x-custom"],
				maxAge: 600,
			}),
		);
		server.options("/data", () => {
			hit = true;
		});
		const port = await listen(server);

		const { status, body, headers } = await httpSend(port, "/data", "OPTIONS", {
			origin: "https://app.example.com",
			"access-control-request-method": "POST",
			"access-control-request-headers": "x-custom",
		});

		expect(status).toBe(204);
		expect(body).toBe("");
		expect(hit).toBe(false);
		expect(headers["access-control-allow-origin"]).toBe("*");
		expect(headers["access-control-allow-methods"]).toBe("GET, POST");
		expect(headers["access-control-allow-headers"]).toBe("x-custom");
		expect(headers["access-control-max-age"]).toBe("600");
	});

	it("exposes headers via exposeHeaders", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: "*", exposeHeaders: ["x-total"] }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://app.example.com",
		});

		expect(headers["access-control-expose-headers"]).toBe("x-total");
	});
});

describe("securityHeaders middleware", () => {
	it("sends hardened defaults on every response", async () => {
		const server = new Server();
		server.use(securityHeaders());
		server.get("/", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { status, headers } = await httpSend(port, "/", "GET");

		expect(status).toBe(200);
		expect(headers["content-security-policy"]).toContain("default-src 'self'");
		expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
		expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(headers["x-content-type-options"]).toBe("nosniff");
		expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
	});

	it("always sends x-dns-prefetch-control even when disabled", async () => {
		const server = new Server();
		server.use(securityHeaders({ dnsPrefetchControl: false }));
		server.get("/", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/", "GET");

		expect(headers["x-dns-prefetch-control"]).toBe("off");
	});

	it("lets each option be disabled with false", async () => {
		const server = new Server();
		server.use(
			securityHeaders({
				contentSecurityPolicy: false,
				crossOriginOpenerPolicy: false,
				frameOptions: false,
				referrerPolicy: false,
				xContentTypeOptions: false,
				dnsPrefetchControl: true,
			}),
		);
		server.get("/", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/", "GET");

		expect(headers["content-security-policy"]).toBeUndefined();
		expect(headers["cross-origin-opener-policy"]).toBeUndefined();
		expect(headers["x-frame-options"]).toBeUndefined();
		expect(headers["referrer-policy"]).toBeUndefined();
		expect(headers["x-content-type-options"]).toBeUndefined();
		expect(headers["x-dns-prefetch-control"]).toBe("on");
	});

	it("accepts a custom content security policy", async () => {
		const server = new Server();
		server.use(
			securityHeaders({ contentSecurityPolicy: "default-src 'none'" }),
		);
		server.get("/", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/", "GET");

		expect(headers["content-security-policy"]).toBe("default-src 'none'");
	});

	it("emits x-frame-options DENY when configured", async () => {
		const server = new Server();
		server.use(securityHeaders({ frameOptions: "DENY" }));
		server.get("/", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/", "GET");

		expect(headers["x-frame-options"]).toBe("DENY");
	});

	it("omits x-frame-options entirely when disabled", async () => {
		const server = new Server();
		server.use(securityHeaders({ frameOptions: false }));
		server.get("/", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/", "GET");

		expect(headers["x-frame-options"]).toBeUndefined();
	});
});

describe("cors middleware allowMethods and credentials", () => {
	it("defaults allow-methods to every HTTP method", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: true }));
		server.options("/data", () => {});
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { status, headers } = await httpSend(
			port,
			"/data",
			"OPTIONS",
			{ origin: "https://app.example.com", "access-control-request-method": "PUT" },
		);

		expect(status).toBe(204);
		expect(headers["access-control-allow-methods"]).toBe(
			"GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD, QUERY",
		);
	});

	it("sends access-control-allow-credentials when enabled", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: true, allowCredentials: true }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://app.example.com",
		});

		expect(headers["access-control-allow-credentials"]).toBe("true");
	});

	it("reflects request headers when allowHeaders is not configured", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: true }));
		server.options("/data", () => {});
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(
			port,
			"/data",
			"OPTIONS",
			{
				origin: "https://app.example.com",
				"access-control-request-method": "POST",
				"access-control-request-headers": "x-auth, x-trace",
			},
		);

		expect(headers["access-control-allow-headers"]).toBe("x-auth, x-trace");
	});

	it("omits the allow-origin header when the origin is not allowlisted", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: ["https://trusted.example.com"] }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://evil.example.com",
		});

		expect(headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("omits the allow-origin header when the origin fails the RegExp", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: /^https:\/\/trusted\.example\.com$/u }));
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(port, "/data", "GET", {
			origin: "https://evil.example.com",
		});

		expect(headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("sends max-age on preflight when configured", async () => {
		const server = new Server();
		server.use(cors({ allowOrigin: true, maxAge: 3600 }));
		server.options("/data", () => {});
		server.get("/data", ({ response }) => response.text("ok"));
		const port = await listen(server);

		const { headers } = await httpSend(
			port,
			"/data",
			"OPTIONS",
			{ origin: "https://app.example.com", "access-control-request-method": "GET" },
		);

		expect(headers["access-control-max-age"]).toBe("3600");
	});
});
