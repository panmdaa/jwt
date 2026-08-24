import type { Server } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { Server as PanmdaaServer } from "../../src/http/server/server";
import { listenHttp, listenPanmdaa } from "./servers";

const require = createRequire(import.meta.url);
const autocannon = require("autocannon");

const JSON_BODY = JSON.stringify({ id: 42, name: "bench" });

const DURATION = Number(process.env.BENCH_DURATION ?? 5);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 50);
const PIPELINES = Number(process.env.BENCH_PIPELINES ?? 1);
const WARMUP_DURATION = Number(process.env.BENCH_WARMUP ?? 3);

interface AcResult {
	requests: { average: number; sent: number };
	latency: { average: number; p99: number };
	throughput: { average: number };
}

interface BenchServer {
	name: string;
	start: () => Promise<{ port: number; close: () => Promise<void> }>;
}

function runAutocannon(options: {
	url: string;
	connections: number;
	duration: number;
	pipelines: number;
	method?: string;
	body?: string;
}): Promise<AcResult> {
	return new Promise((resolve, reject) => {
		const instance = autocannon(
			options,
			(err: Error | null, result: AcResult) => {
				if (err) reject(err);
				else resolve(result);
			},
		);
		autocannon.track(instance, {
			renderProgressBar: false,
			renderResultsTable: false,
		});
	});
}

function tableRow(name: string, result: AcResult, duration: number): string {
	const rps = Math.round(result.requests.average);
	const latency = result.latency.average.toFixed(2);
	const p99 = result.latency.p99.toFixed(2);
	const mbps = (result.throughput.average / (1024 * 1024)).toFixed(2);
	return `${name.padEnd(24)} ${String(rps).padStart(10)} req/s  ${latency.padStart(8)} ms avg  ${p99.padStart(8)} ms p99  ${mbps.padStart(8)} MB/s  (${duration}s)`;
}

function nodeHttp(): BenchServer {
	return {
		name: "node http (baseline)",
		start: () => {
			const server = createHttpServer((req, res) => {
				const chunks: Buffer[] = [];
				req.on("data", (c: Buffer) => chunks.push(c));
				req.on("end", () => {
					JSON.parse(Buffer.concat(chunks).toString("utf8"));
					res.setHeader("Content-Type", "application/json; charset=utf-8");
					res.end(JSON_BODY);
				});
			});
			return listenHttp(server);
		},
	};
}

function panmdaa(): BenchServer {
	return {
		name: "panmdaa",
		start: () => {
			const server = new PanmdaaServer();
			server.post("/", async ({ response, body }) => {
				await body.json();
				response.json({ id: 42, name: "bench" });
			});
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
			app.use(createApp.json());
			app.post("/", (_req, res) => {
				res.json({ id: 42, name: "bench" });
			});
			const server = createHttpServer(app as unknown as Server);
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
			app.post("/", async (_req, reply) => {
				reply.send({ id: 42, name: "bench" });
			});
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
			app.post("/", async (c) => {
				await c.req.json();
				return c.json({ id: 42, name: "bench" });
			});
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
			const app = new Elysia().post("/", () => ({ id: 42, name: "bench" }));
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

async function main(): Promise<void> {
	const servers: BenchServer[] = [
		nodeHttp(),
		panmdaa(),
		express(),
		fastify(),
		hono(),
		elysia(),
	];

	console.log(
		`Benchmarking POST / (JSON body) — ${CONNECTIONS} connections x ${DURATION}s x ${PIPELINES} pipeline(s)\n`,
	);

	const results: Array<{ name: string; result: AcResult }> = [];

	for (const bench of servers) {
		const { port, close } = await bench.start();
		console.log(`starting ${bench.name} on :${port}`);

		try {
			await runAutocannon({
				url: `http://localhost:${port}/`,
				connections: CONNECTIONS,
				duration: WARMUP_DURATION,
				pipelines: PIPELINES,
				method: "POST",
				body: JSON_BODY,
			});

			const result = await runAutocannon({
				url: `http://localhost:${port}/`,
				connections: CONNECTIONS,
				duration: DURATION,
				pipelines: PIPELINES,
				method: "POST",
				body: JSON_BODY,
			});
			results.push({ name: bench.name, result });
		} finally {
			await close();
		}
	}

	console.log("\nResults (POST / with JSON body):\n");
	for (const { name, result } of results)
		console.log(tableRow(name, result, DURATION));

	const sorted = [...results].sort(
		(a, b) => b.result.requests.average - a.result.requests.average,
	);
	console.log("\nRanking by requests/sec:");
	sorted.forEach(({ name, result }, i) => {
		console.log(
			`  ${i + 1}. ${name} — ${Math.round(result.requests.average).toLocaleString("en-US")} req/s`,
		);
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
