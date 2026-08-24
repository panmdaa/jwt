# Benchmarking

Benchmarks live in `bench/`, its own package (`@panmdaa/server-bench`) with a devDependency on `ws`, `hono`, `find-my-way`, `express`, `fastify`, `elysia`, `autocannon`, `tsx`.

## How to run

```sh
npm run bench                # all benches
npm run bench:router         # RadixTree vs hono vs find-my-way
npm run bench:http           # HTTP server vs node/express/fastify/hono/elysia
npm run bench:http:post      # JSON POST bodies, same competitors
npm run bench:middleware     # compileHandler chains vs direct call
npm run bench:parse          # parseQuery/parseCookies vs baselines
npm run bench:ws             # pipelined echo clients — panmdaa vs ws baseline
```

Tuning knobs via env vars (WS bench): `BENCH_DURATION`, `BENCH_CONNECTIONS`, `BENCH_PIPELINE`, `BENCH_PAYLOAD`, `BENCH_WARMUP`.

## What each bench measures

### Router (`bench/src/router.bench.ts`)

RadixTree vs hono's `RegExpRouter` vs `find-my-way`, across the route tables in `shared.ts`:

- `ROUTES` — realistic mixed static/dynamic/wildcard.
- `DEEP_ROUTES` — deeply nested dynamic routes.
- `LARGE_ROUTES` — 1000 generated routes for scalability.

### HTTP (`bench/src/http-bench.ts`, `http-post-bench.ts`)

`autocannon` against node, panmdaa, express, fastify, hono, elysia — static and dynamic GET, plus JSON POST. Each server is **warmed up** before measuring (the first server measured runs cold and the last one hot, `http-bench.ts:74-82`).

### Middleware (`bench/src/middleware.bench.ts`)

`compileHandler` chains of 1/3/5/10 handlers vs a plain array loop. This is the evidence behind [design decision #5](../architecture/design-decisions.md#5-compiling-middleware-chains-into-one-function).

### Parse (`bench/src/parse.bench.ts`)

`parseQuery`/`parseCookies` vs naive baselines.

### WebSocket (`bench/src/ws-bench.ts`)

Pipelined echo clients (the `ws` library) hammering two servers — panmdaa and a bare `ws` `WebSocketServer` baseline (`ws-servers.ts`). Measures msg/s, avg/p99 latency, MB/s.

## Current results

The `[bench]` claims in the docs are backed by these runs. To re-verify any claim:

```sh
npm run bench:router && npm run bench:http && npm run bench:ws
```

> ⚠️ Benchmarks are machine-relative. Re-run before quoting numbers in an issue or PR, and note the Node version and CPU used.
