# Design decisions

This document records the *why* behind the architecture. Each entry states the problem, the decision, and the evidence that justifies it.

## 1. Zero runtime dependencies

**Problem**: most HTTP/WS server libraries pull in deps (routing, `bufferutil`/`ws`, body parsers, multipart, cookies).

**Decision**: everything is implemented in-repo. `node:zlib` is used for deflate/inflate (a native module, not a dependency). The only `devDependencies` are tooling: TypeScript, tsup, biome, vitest, mime-db (data source, compiled into `src/generated/mime.ts`).

**Why**: a dependency is trust and maintenance you can't inspect. With zero deps the entire hot path is auditable in one repo, the bundle is tree-shakable (`sideEffects: false`, `package.json:21`), and there are no version-conflict or supply-chain surprises.

## 2. Three-tier routing: static map → compiled regex → radix trie

**Problem**: a router must be fast for the common case (static URLs) yet still express params/wildcards; a plain `Map<path, handler>` can't, an array scan is O(n), and a single regex per route has backtracking.

**Decision**: `InternalRadixTree.find` tries, in order:

1. **Flat static map** — O(1), zero allocation, immutable shared `FindResult` (`internal-radix-tree.ts:240-245`). Inspired by hono's linear router.
2. **One compiled regex per method** — dynamic routes are factored into a trie and emitted as a single `RegExp`, so matching is one native `exec()` (`internal-radix-tree.ts:302`, `buildMatcher` `:97-204`). If routes conflict, this tier is skipped.
3. **Char-code radix trie traversal** — the conflict-safe fallback preserving registration precedence (`radix-tree/utils.ts:116-236`).

**Evidence** `[bench]`: see `bench/src/router.bench.ts` — static lookups and dynamic matcher beat plain-map and find-my-way baselines across `ROUTES`/`DEEP_ROUTES`/`LARGE_ROUTES` (see [Benchmarking](../development/benchmarking.md)).

## 3. Lazy construction of the radix tree

**Problem**: building a radix trie on every registration is wasted work when routes are registered in bulk at startup.

**Decision**: `RadixTree.add` pushes into a `deferred` array; the tree is built on the first `find()`/`methods()` and the find function is swapped to the built engine afterwards (`radix-tree.ts:9-25`). One-time amortized cost, O(1) dispatch afterwards.

## 4. Optional params compiled away

**Problem**: `:name?` segments force runtime branching in the matcher.

**Decision**: optional segments are expanded into *concrete* routes at registration time (`internal-radix-tree.ts:247-289`) — a mid-path optional becomes two routes, a tail of optionals becomes N. The matcher never sees a `?`.

## 5. Compiling middleware chains into one function

**Problem**: running N middlewares as a loop with per-call `next` closures allocates and deoptimizes; Express-style arrays are slower and can't short-circuit.

**Decision**: `compileHandler` code-generates a single `new Function` that inlines the chain (`compile.ts`). Key semantics:

- **Conditional await** — a handler is awaited only when it actually returned a thenable (`compile.ts:33`), so sync handlers pay **no microtask per request**.
- `next` is a shared `advance()` closure that flips a `nextCalled` flag — no per-call allocation.
- **Sequential pipeline, not Express**: a middleware that returns a promise *and* calls `next()` blocks the following handlers until it settles (the compiled code `await`s before the next handler). This is a deliberate difference from Express, which does not await. Document it — it affects how async middleware is written.

**Evidence** `[bench]`: chains of 3 handlers compile ~2x faster than a plain loop, 5-handler ~1.7x (see [Benchmarking](../development/benchmarking.md)).

## 6. `response`, `headers`, `body`, `query`, `cookies` are lazy getters

**Problem**: a request that just returns a string shouldn't pay for building a response object, parsing cookies it never reads, or allocating body representations.

**Decision**: every `ResponseContext`/`BodyContext` member is a cached lazy getter (`http-handler.ts:44`, `response.ts:30`, `body.ts:23`). `response` is only constructed when the handler sends something; `raw()/json()/text()/…` cache per representation and reuse each other (e.g. `json()` reuses `cachedText` to avoid a second Buffer→string conversion, `body.ts:37-51`).

**Evidence** `[bench]`: lazy response got a ~5.3% improvement on context-only workloads vs eager construction (see [Benchmarking](../development/benchmarking.md)).

## 7. Auto-finish responses in `Server.run`

**Problem**: handlers that only set headers/status would leave responses hanging open.

**Decision**: `run()` auto-ends the response: if the handler returned a promise, the response is ended when it settles; if synchronous, it's ended immediately (`server.ts:116-145`). "Only async handlers allocate a promise here." The `response.writableEnded` guard covers both HTTP/1 and the http2 wrapper.

## 8. WebSocket: zero-alloc parse, zero-copy writes, cork

**Problem**: frame parsing and writes are the WS hot path; per-frame allocation and copies destroy throughput.

**Decision**:

- **Reusable frame**: `parseFrameInto(buffer, out, …)` writes into a caller-provided `ParsedFrame` (`parser.ts:28`).
- **Zero-copy payload**: `payload = buffer.subarray(...)` is a view, and unmasking happens **in place** (`parser.ts:96-98`).
- **Two-level unmasking**: unrolled 8-byte loop below 64 bytes, three-pass `Uint32Array` word path (with a rotated mask word absorbing alignment) above (`parser.ts:133-237`).
- **`cork()`/`uncork()`**: header+payload writes are coalesced into one kernel write (`connection.ts:586-592`); text sends avoid the `Buffer.from` conversion entirely (`connection.ts:599-612`).
- **Zero-listener fast path**: `text`/`binary`/`message` events allocate only when there are listeners (`emitMessage`, `connection.ts:415-450`).

## 9. permessage-deflate: always no-context-takeover, threshold, concurrency gate

**Problem**: deflate contexts bloat memory and zlib calls must not starve the event loop.

**Decision**:

- `serverNoContextTakeover` + `clientNoContextTakeover` are always negotiated (`permessage-deflate.ts:38,54`) — the context is reset after every message, trading a small compression ratio for bounded memory and interleavability.
- Compression below `threshold = 1024` bytes is skipped (`permessage-deflate.ts:78-84`).
- If compression doesn't shrink the payload, the **original** is sent (`permessage-deflate.ts:147-153`).
- `ZlibConcurrencyGate` caps concurrent inflate/deflate operations, shared per limit via a module-level cache (`concurrency-gate.ts:28-42`) — zlib is native and synchronous per call but awaited here; unbounded concurrency would stall the event loop.

## 10. Unref'd timers everywhere

**Problem**: heartbeat intervals and close timeouts would keep the process alive.

**Decision**: `setInterval`/`setTimeout` in heartbeat and close handshake are `unref()`'d (`heartbeat.ts:29-33`, `connection.ts:680-688`), so an idle server can exit cleanly.

## 11. Error system generated from status codes

**Problem**: ~60 named error classes with identical shape is boilerplate.

**Decision**: `createHttpErrorClass(status, className, defaultMessage)` generates them from `STATUS_MESSAGES` (`http-error.ts:94-112`, `errors.ts:3-260`). Special cases needing constructor args (`MethodNotAllowed(method)`, `PayloadTooLarge(maxBodySize)`, `UnsupportedMediaType`) are hand-written.

## 12. HTTP/2 as a synthesized request instead of native conversion

**Problem**: Node's native HTTP/2 request/response conversion would also consume extended CONNECT (WebSocket-over-HTTP/2) streams.

**Decision**: `Server.handleStream` first asks `WebSocketUpgrader.handleStream` to consume CONNECT streams; anything else becomes a hand-built `ServerRequest` (`createHttp2StreamRequest`) and `Http2StreamResponse`, deferring `stream.respond()` until the first write (`http2.ts:78-81`). This keeps one code path for HTTP/1 and HTTP/2.

## 13. Middleware baked into routes at registration

**Problem**: naive middleware must be re-run for every route on every request.

**Decision**: `use()` just appends to `this.middlewares`; `addRoute` composes `compileHandler(...middlewares, handler)` **once**, at registration (`router.ts:39-42`). A `use()` after a route is registered does not affect it. Same for WebSocket routes (`router.ts:50-56`).

## 14. Separate WebSocket routing tree

**Problem**: `server.ws("/*", …)` is a catch-all that must not shadow HTTP routes, and WS routes match by path only.

**Decision**: WS routes live in their own `wsTree` keyed by the pseudo-method `WS_METHOD = "WS"` (`router.ts:14`). HTTP and WS never collide.

## 15. `QUERY` pseudo-method for body-capable "read" routes

**Problem**: sometimes you need a body-capable route that isn't `POST/PUT/PATCH/DELETE`.

**Decision**: `query()` registers under the `QUERY` pseudo-method; `Server.createContext` maps it to `ContextBodyHandler` (`server.ts:98`), so `ctx.body` is available without a real HTTP method.
