import type { Server } from "node:http";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as PanmdaaServer } from "../../src/http/server/server";

export interface BenchServer {
	name: string;
	start: () => Promise<{ port: number; close: () => Promise<void> }>;
}

type HttpListener = Parameters<typeof createHttpServer>[0];

export function listenHttp(
	server: Server,
): Promise<{ port: number; close: () => Promise<void> }> {
	return new Promise((resolve) => {
		server.listen(0, () => {
			const address = server.address() as AddressInfo;
			resolve({
				port: address.port,
				close: async () => {
					server.closeAllConnections();
					await new Promise<void>((r) => server.close(() => r()));
				},
			});
		});
	});
}

export function listenPanmdaa(
	server: PanmdaaServer,
): Promise<{ port: number; close: () => Promise<void> }> {
	return new Promise((resolve) => {
		server.listen(0);
		const interval = setInterval(() => {
			const address = server.address();
			if (!address) return;
			clearInterval(interval);
			const native = server.native as Server;
			resolve({
				port: (address as AddressInfo).port,
				close: async () => {
					native.closeAllConnections();
					await new Promise<void>((r) => native.close(() => r()));
				},
			});
		}, 5);
	});
}

const respond = (_req: unknown, res: { end: (b: string) => void }) =>
	res.end("ok");

function nodeHttp(): BenchServer {
	return {
		name: "node http (baseline)",
		start: () => {
			const server = createHttpServer(respond as HttpListener);
			return listenHttp(server);
		},
	};
}

function panmdaa(): BenchServer {
	return {
		name: "panmdaa",
		start: () => {
			const server = new PanmdaaServer();
			server.get("/", ({ response }) => response.text("ok"));
			server.get("/user/:id", ({ response, params }) =>
				response.text(String(params.id)),
			);
			return listenPanmdaa(server);
		},
	};
}

function express(): BenchServer {
	return {
		name: "express",
		start: async () => {
			const { default: createApp } = await import("express");
			const app = createApp();
			app.get("/", (_req, res) => res.end("ok"));
			app.get("/user/:id", (req, res) => res.end(String(req.params.id)));
			const server = createHttpServer(app as HttpListener);
			return listenHttp(server);
		},
	};
}

function fastify(): BenchServer {
	return {
		name: "fastify",
		start: async () => {
			const { default: createApp } = await import("fastify");
			const app = createApp();
			app.get("/", (_req, reply) => reply.send("ok"));
			app.get<{ Params: { id: string } }>("/user/:id", (req, reply) =>
				reply.send(req.params.id),
			);
			await app.ready();
			const server = app.server;
			return new Promise((resolve) => {
				server.listen(0, () => {
					const address = server.address() as AddressInfo;
					resolve({
						port: address.port,
						close: async () => {
							server.closeAllConnections();
							await app.close();
						},
					});
				});
			});
		},
	};
}

function hono(): BenchServer {
	return {
		name: "hono",
		start: async () => {
			const { Hono } = await import("hono");
			const { serve } = await import("@hono/node-server");
			const app = new Hono();
			app.get("/", (c) => c.text("ok"));
			app.get("/user/:id", (c) => c.text(c.req.param("id")));
			return new Promise((resolve) => {
				const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
					const native = server as unknown as Server;
					resolve({
						port: info.port,
						close: async () => {
							native.closeAllConnections();
							await new Promise<void>((r) => native.close(() => r()));
						},
					});
				});
			});
		},
	};
}

function elysia(): BenchServer {
	return {
		name: "elysia",
		start: async () => {
			const { Elysia } = await import("elysia");
			const app = new Elysia()
				.get("/", () => "ok")
				.get("/user/:id", ({ params }) => String(params.id));
			const fetchApp = app.fetch as (req: Request) => Promise<Response>;
			const server = createHttpServer(async (req, res) => {
				const url = `http://${req.headers.host ?? "localhost"}${req.url}`;
				const headers = new Headers(req.headers as Record<string, string>);
				const body =
					req.method === "GET" || req.method === "HEAD"
						? undefined
						: await new Promise<Buffer>((resolve) => {
								const chunks: Buffer[] = [];
								req.on("data", (c) => chunks.push(c));
								req.on("end", () => resolve(Buffer.concat(chunks)));
							});
				const bodyInit: BodyInit | undefined =
					body === undefined ? undefined : new Uint8Array(body);
				const response = await fetchApp(
					new Request(url, {
						method: req.method,
						headers,
						body: bodyInit,
					}),
				);
				res.writeHead(response.status, Object.fromEntries(response.headers));
				res.end(Buffer.from(await response.arrayBuffer()));
			});
			return listenHttp(server);
		},
	};
}

export const BENCH_SERVERS: BenchServer[] = [
	nodeHttp(),
	panmdaa(),
	express(),
	fastify(),
	hono(),
	elysia(),
];
