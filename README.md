<img src="./misc/banner.svg" alt="Panmdaa Server" />

<p align="center">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" />
  </a>
  <a href="https://npmjs.org/package/@panmdaa/server">
    <img src="https://badgen.now.sh/npm/v/@panmdaa/server" alt="version" />
  </a>
  <a href="https://npmjs.org/package/@panmdaa/server">
    <img src="https://badgen.now.sh/npm/dm/@panmdaa/server" alt="downloads" />
  </a>
  <a href="https://bundlephobia.com/result?p=@panmdaa/server">
    <img src="https://img.shields.io/bundlephobia/min/@panmdaa/server" alt="Bundle Size" />
  </a>
  <a href="https://bundlephobia.com/result?p=@panmdaa/server">
    <img src="https://img.shields.io/bundlephobia/minzip/@panmdaa/server" alt="Bundle Size (gzip)" />
  </a>
</p>


# @panmdaa/server

Zero-dependency TypeScript HTTP and WebSocket server with a compiled-radix router — no runtime dependencies.

**`@panmdaa/server`** is a from-scratch server library built on Node's native `http`/`https`/`http2` transport. It ships a radix-tree router with three-tier matching (O(1) static map → one compiled regex per method → conflict-safe trie), a code-generated middleware pipeline with conditional `await`, and a zero-allocation, zero-copy WebSocket stack with permessage-deflate.

```
npm install @panmdaa/server
```

## Quick look

```ts
import {
  Server, Router, cors, securityHeaders, NotFound,
} from "@panmdaa/server";

// Compose routers, mount them on a server
const users = new Router();
users.get("/:id", ({ params, response }) => {
  response.json({ user: params.id });
});

const server = new Server();
server.use(cors({ allowOrigin: "*" }));
server.use(securityHeaders());
server.router("/api/users", users);

// Static route, typed params, lazy response
server.get("/message/:name", ({ params, response }) => {
  response.type("text/html");
  response.send(`Hello, ${params.name}!`);
});

// Typed errors → mapped responses
server.get("/teapot", () => {
  throw new NotFound();
});

// WebSocket route — separate tree, path-only matching
server.ws("/live", ({ socket }) => {
  socket.send("welcome!");
  socket.on("message", ({ data }) => socket.send(`echo: ${data}`));
});

server.listen(3000);
```

> **Single entry point**: everything — `Server`, `Router`, middleware, errors, WebSocket helpers — is exported from `@panmdaa/server`. See [Development](docs/development/tooling.md).

## Routing

Verbs, params, wildcards and composition — all type-checked at compile time:

```ts
import { Server } from "@panmdaa/server";

const server = new Server();

// Static, param and wildcard routes
server.get("/", ({ response }) => response.send("index"));
server.get("/user/:id", ({ params, response }) => {
  response.json({ id: params.id });   // params.id: string — typed by the path
});
server.get("/user/:id?/books", ({ params, response }) => { … }); // optional segment
server.get("/static/*", ({ params, response }) => {
  response.json({ file: params["*"] }); // everything after /static/
});

// Body-capable "read" routes (POST, PUT, PATCH, DELETE, QUERY)
server.post("/api/items", async ({ body, response }) => {
  const item = await body.json();
  response.status = 201;
  response.json({ created: item });
});

// Group a prefix in place, or mount an existing router
server.group("/api", (api) => {
  api.get("/health", ({ response }) => response.send("ok"));
});
```

The matching engine is a three-tier radix tree:

| Tier | What | Cost |
|------|------|------|
| Static map | routes without params/wildcards | O(1), zero allocation |
| Compiled regex | one `RegExp` per method for dynamic routes | single native `exec()` |
| Trie fallback | only when routes conflict | preserves registration precedence |

Optional segments are expanded into concrete routes at registration; matching never sees a `?`. See the [router docs](docs/router/how-it-works.md).

## Middleware

Middleware is compiled into a single function per route — conditional `await`, shared `next`, short-circuit. It's baked into each route **at registration time**:

```ts
import { Server, cors, securityHeaders } from "@panmdaa/server";

const server = new Server();

server.use(cors({ allowOrigin: ["https://app.example.com"] }));
server.use(securityHeaders());
server.use(({ state, response }, next) => {   // custom middleware
  state.startedAt = performance.now();
  next();
});

server.get("/", ({ state, response }) => {
  response.json({ took: performance.now() - state.startedAt });
});
```

Two contracts make the chain work (see [handler compilation](docs/http/handler-compilation.md)):

- **Not calling `next()` terminates the chain** — how `cors()` short-circuits OPTIONS preflights.
- **A sync middleware calling `next()` pays zero microtasks** — handlers are only `await`ed when they actually return a thenable.

`use()` applies to routes registered after it, and to WebSocket routes too.

## WebSockets

Path-only matching in a separate tree — `server.ws("/*")` never shadows HTTP routes. Zero-alloc parsing, zero-copy writes, `cork`'d coalescing:

```ts
import { Server, createWebSocketHeartbeat, CloseCode } from "@panmdaa/server";

const heartbeat = createWebSocketHeartbeat({ intervalMs: 30_000, timeoutMs: 10_000 });

const server = new Server({
  websocket: {                       // shared options for every WS route
    maxPayload: "8mb",
    perMessageDeflate: { threshold: "1kb" },
  },
});

server.ws("/chat", ({ socket }) => {
  heartbeat.track(socket);           // close dead connections
  socket.on("message", ({ data, isBinary }) => {
    socket.send(isBinary ? data : `echo: ${data}`);
  });
  socket.on("close", ({ code, reason, wasClean }) => { … });
});

socket.close(CloseCode.NormalClosure, "bye"); // graceful
socket.terminate();                           // hard kill
```

The handshake validates strictly (RFC 6455): `Sec-WebSocket-Key`, version 13, `Connection: Upgrade`. Messages are UTF-8 validated, `maxPayload` applies to the whole fragmented message and to the **inflated** size (decompression-bomb protection). Permessage-deflate always negotiates no-context-takeover and skips payloads that don't shrink. See the [WebSocket docs](docs/websocket/lifecycle.md).

## HTTP/2 & TLS

One code path for HTTP/1, HTTP/2 and WebSocket-over-HTTP/2:

```ts
import { readFileSync } from "node:fs";
import { Server } from "@panmdaa/server";

const server = new Server({
  http2: true,                                    // h2c, or with tls → ALPN
  tls: { key: readFileSync("./key.pem"), cert: readFileSync("./cert.pem") },
  maxBodySize: "2mb",
  onError: (error) => console.error(error),
});
```

HTTP/2 requests are synthesized into the same request/response pipeline (`createHttp2StreamRequest` + `Http2StreamResponse`); extended CONNECT streams (`:protocol: websocket`) are intercepted for `ws()` routes. See [HTTP/2](docs/http/http2.md).

## Errors

Throw typed errors, get mapped responses — unknown errors become 500 automatically:

```ts
import {
  HttpError, NotFound, BadRequest,
  MethodNotAllowed, PayloadTooLarge, UnsupportedMediaType,
} from "@panmdaa/server";

server.get("/user/:id", ({ params }) => {
  throw new NotFound();
});

throw new BadRequest("Invalid credentials");
throw new MethodNotAllowed("PATCH");
```

`HttpError(status, message?, description?, cause?)` is the base; ~60 named subclasses are generated from `STATUS_MESSAGES`. The `onError` hook sees every error (including the 500s clients don't get). See [Errors](docs/http/errors.md).

## Request body

Lazy, cached, one representation per read:

```ts
server.post("/api/echo", async ({ body, response }) => {
  const raw  = await body.raw();         // Uint8Array
  const text = await body.text();        // string
  const json = await body.json();        // parsed — reuses text if decoded
  const buf  = await body.arrayBuffer(); // ArrayBuffer
  const form = await body.formData();    // FormData (urlencoded + multipart)
  const stream = await body.stream();    // web ReadableStream
  response.json({ received: json });
});
```

`maxBodySize` (default 16 MiB) rejects overflow with `PayloadTooLarge` (413) **while streaming**. Multipart is parsed with manual byte scanning — no regex, no per-part allocations. See [Body](docs/http/body.md).

## API

> **Single entry point**: everything — `Server`, contexts, handler compilation, `Router`/`RadixTree`, the WebSocket stack, errors, middleware — is exported from `@panmdaa/server`.

| Member | Description |
|--------|-------------|
| `new Server(options?)` | Native HTTP server (http/https/http2) + router + WS upgrader |
| `server.use(...mw)` | Register middleware for routes added after this call |
| `server.get/post/put/delete/patch/options/head` | Register a typed HTTP route |
| `server.all(path, ...h)` | Same handler under every HTTP method |
| `server.query(path, ...h)` | Body-capable route (no real HTTP method) |
| `server.ws(path, ...h)` | Register a WebSocket route (path-only tree) |
| `server.group(prefix, fn)` | Prefix + re-register child routes into the parent |
| `server.router(prefix?, router)` | Mount an existing `Router` |
| `server.listen(port)` / `server.address()` / `server.close()` | Native server controls |
| `ctx.params` | Route params, typed by the path (`Path<T>`) |
| `ctx.query` / `ctx.cookies` | Parsed query (duplicates → arrays) / cookies |
| `ctx.body` | Lazy `BodyContext` (json/text/raw/formData/stream) |
| `ctx.response` | Lazy `ResponseContext` — `send/json/html/text/type/header/vary/file/download/stream/redirect/end`, `status` property |
| `ctx.state` | Lazy per-request shared object for middleware |
| `ctx.socket` | `WebSocketConnection` on WS routes |
| `response.status` | Mutable status property (default 200) — not a method |
| `response.file(path)` / `download(path)` | Stream a file with `Content-Length` + mime |
| `cors(options)` | CORS middleware (origin rules, preflight 204 short-circuit) |
| `securityHeaders()` | Hardened security headers middleware |
| `createWebSocketHeartbeat(options)` | Close unresponsive WS connections (`track(socket)`) |
| `CloseCode` | Enum: `NormalClosure`, `GoingAway`, `ProtocolError`, … |
| `HttpError` + subclasses | Typed errors mapped to status codes |

## Internal architecture

```
src/
├── index.ts       ← root barrel — re-exports error, http, middleware, router, ws
├── router/       ← Router + three-tier RadixTree (static map / regex / trie)
├── http/
│   ├── handler/  ← compileHandler — generated middleware pipeline
│   ├── context/  ← ContextHandler, ContextHttpHandler, ContextBodyHandler
│   │   ├── body/     ← lazy BodyContext (raw/json/text/formData/multipart)
│   │   └── response/ ← lazy ResponseContext (auto Content-Length, file streaming)
│   └── server/   ← Server class + WebSocketUpgrader + native transport
├── ws/
│   ├── handshake/    ← RFC 6455 upgrade (HTTP/1 + HTTP/2 extended CONNECT)
│   ├── frame/        ← zero-alloc parser, builder, two-level unmask
│   ├── connection/   ← WebSocketConnection state machine
│   ├── compression/  ← permessage-deflate + zlib concurrency gate
│   └── heartbeat/    ← dead-connection sweeper (unref'd timers)
├── middleware/   ← cors, securityHeaders
└── error/        ← HttpError + generated status classes
```

Built on Node's native transport, zero runtime dependencies, pure ESM. Full internal documentation lives in [`docs/`](docs/README.md) — architecture, router internals, request lifecycle, WebSocket stack, and the design decisions behind every subsystem.

## Scripts

| `npm run` | Description |
|-----------|-------------|
| `build` | Regenerate mime table, bundle with tsup (ESM + DTS) |
| `test` | Run the test suite with vitest (HTTP, router, WebSocket, errors) |
| `typecheck` | TypeScript strict check |
| `lint` | Biome lint |
| `format` | Biome format |
| `bench` | Run all benchmarks (router, HTTP, middleware, parse, WS) |

---
<p align="center">
  Crafted with ❤️ by the Panmdaa project.
</p>
