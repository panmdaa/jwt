import { createRequire } from "node:module";
import { BENCH_SERVERS } from "./servers";

const require = createRequire(import.meta.url);
const autocannon = require("autocannon");

interface AcResult {
	requests: { average: number; sent: number };
	latency: { average: number; p99: number };
	throughput: { average: number };
}

interface AcOptions {
	url: string;
	connections: number;
	duration: number;
	pipelines: number;
}

const DURATION = Number(process.env.BENCH_DURATION ?? 5);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 50);
const PIPELINES = Number(process.env.BENCH_PIPELINES ?? 1);

const PATHS = ["/", "/user/42", "/user/42/books"];

const WARMUP_DURATION = 3;

function runAutocannon(options: AcOptions): Promise<AcResult> {
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

async function main(): Promise<void> {
	console.log(
		`Benchmarking ${CONNECTIONS} connections x ${DURATION}s x ${PIPELINES} pipeline(s) over ${PATHS.length} routes\n`,
	);

	const staticResults: Array<{ name: string; result: AcResult }> = [];
	const dynamicResults: Array<{ name: string; result: AcResult }> = [];

	for (const bench of BENCH_SERVERS) {
		const { port, close } = await bench.start();
		console.log(`starting ${bench.name} on :${port}`);

		try {
			for (const path of PATHS) {
				await runAutocannon({
					url: `http://localhost:${port}${path}`,
					connections: CONNECTIONS,
					duration: WARMUP_DURATION,
					pipelines: PIPELINES,
				});
			}

			// Warmup run: the measured runs below only count after the JIT
			// and CPU have reached steady state, otherwise the first server
			// measured runs cold and the last one hot, skewing the ranking.
			await runAutocannon({
				url: `http://localhost:${port}/`,
				connections: CONNECTIONS,
				duration: WARMUP_DURATION,
				pipelines: PIPELINES,
			});

			const staticResult = await runAutocannon({
				url: `http://localhost:${port}/`,
				connections: CONNECTIONS,
				duration: DURATION,
				pipelines: PIPELINES,
			});
			staticResults.push({ name: bench.name, result: staticResult });

			await runAutocannon({
				url: `http://localhost:${port}/user/42`,
				connections: CONNECTIONS,
				duration: WARMUP_DURATION,
				pipelines: PIPELINES,
			});

			const dynamicResult = await runAutocannon({
				url: `http://localhost:${port}/user/42`,
				connections: CONNECTIONS,
				duration: DURATION,
				pipelines: PIPELINES,
			});
			dynamicResults.push({ name: bench.name, result: dynamicResult });
		} finally {
			await close();
		}
	}

	for (const [label, results] of [
		["static route (GET /)", staticResults],
		["dynamic route (GET /user/42)", dynamicResults],
	] as const) {
		console.log(`\nResults (${label}):\n`);
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
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
