import { createRequire } from "node:module";
import { BENCH_WS_SERVERS } from "./ws-servers";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws");

const DURATION = Number(process.env.BENCH_DURATION ?? 5);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 100);
const PIPELINE = Number(process.env.BENCH_PIPELINE ?? 8);
const PAYLOAD_BYTES = Number(process.env.BENCH_PAYLOAD ?? 4);
const WARMUP_DURATION = Number(process.env.BENCH_WARMUP ?? 3);
const SAMPLE_EVERY = 16;

const PAYLOAD = "x".repeat(Math.max(1, PAYLOAD_BYTES));

interface Stats {
	total: number;
	latencies: number[];
}

interface LiveClient {
	ws: InstanceType<typeof WebSocket>;
	done: Promise<void>;
}

function openClient(port: number, pipeline: number, stats: Stats): LiveClient {
	const ws = new WebSocket(`ws://localhost:${port}/`);
	let inFlight = 0;
	let processed = 0;
	const pending: number[] = [];

	const sendOne = () => {
		while (inFlight < pipeline) {
			pending.push(performance.now());
			ws.send(PAYLOAD);
			inFlight++;
		}
	};

	ws.on("open", () => sendOne());
	ws.on("message", () => {
		const t0 = pending.shift();
		inFlight--;
		processed++;
		stats.total++;
		if (processed % SAMPLE_EVERY === 0 && t0 !== undefined) {
			stats.latencies.push(performance.now() - t0);
		}
		sendOne();
	});

	const done = new Promise<void>((resolve) => {
		ws.on("close", () => resolve());
		ws.on("error", () => {});
	});

	return { ws, done };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function measure(
	port: number,
	connections: number,
	pipeline: number,
	duration: number,
): Promise<Stats> {
	const stats: Stats = { total: 0, latencies: [] };
	const clients: LiveClient[] = [];

	for (let i = 0; i < connections; i++)
		clients.push(openClient(port, pipeline, stats));

	await sleep(duration * 1000);

	for (const client of clients) client.ws.close();
	await Promise.allSettled(clients.map((client) => client.done));

	return stats;
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
	);
	return sorted[index];
}

function tableRow(name: string, stats: Stats, duration: number): string {
	const msgPerSec = stats.total / duration;
	const sorted = [...stats.latencies].sort((a, b) => a - b);
	const avg = percentile(sorted, 50);
	const p99 = percentile(sorted, 99);
	const mbps = (msgPerSec * PAYLOAD_BYTES) / (1024 * 1024);
	return `${name.padEnd(24)} ${String(Math.round(msgPerSec)).padStart(12)} msg/s  ${avg.toFixed(2).padStart(7)} ms avg  ${p99.toFixed(2).padStart(7)} ms p99  ${mbps.toFixed(2).padStart(8)} MB/s`;
}

async function main(): Promise<void> {
	console.log(
		`Benchmarking ${CONNECTIONS} connections x ${PIPELINE} in-flight x ${PAYLOAD_BYTES}-byte echo over ${DURATION}s\n`,
	);

	const results: Array<{ name: string; stats: Stats }> = [];

	for (const bench of BENCH_WS_SERVERS) {
		const { port, close } = await bench.start();
		console.log(`starting ${bench.name} on ws://localhost:${port}`);

		try {
			await measure(port, CONNECTIONS, PIPELINE, WARMUP_DURATION);

			const stats = await measure(port, CONNECTIONS, PIPELINE, DURATION);
			results.push({ name: bench.name, stats });
		} finally {
			await close();
		}
	}

	console.log("\nResults (echo round-trips):\n");
	for (const { name, stats } of results)
		console.log(tableRow(name, stats, DURATION));

	const sorted = [...results].sort((a, b) => b.stats.total - a.stats.total);
	console.log("\nRanking by messages/sec:");
	sorted.forEach(({ name, stats }, i) => {
		console.log(
			`  ${i + 1}. ${name} — ${Math.round(stats.total / DURATION).toLocaleString("en-US")} msg/s`,
		);
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
