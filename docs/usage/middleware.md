# Middleware

Middleware is how you share logic across routes: auth, logging, headers, request validation.

## Writing middleware

A middleware is `(ctx, next) => …` — the same context the route handler gets:

```ts
server.use(({ response }, next) => {
  response.header("x-powered-by", "panmdaa");
  next();
});
```

The two contracts (see [Handler compilation](../http/handler-compilation.md)):

1. **Not calling `next()` terminates the chain.** That's how you short-circuit — e.g. an auth middleware rejecting a request:

```ts
server.use(({ response, url }, next) => {
  if (!url.startsWith("/public")) {
    response.status = 401;
    response.json({ error: "unauthorized" });
    return; // chain stops — the route handler never runs
  }
  next();
});
```

2. **Returning a promise before calling `next()` blocks the rest of the chain.** Async middleware must `await` its work, then call `next()` (or not):

```ts
server.use(async (ctx, next) => {
  ctx.state.user = await loadUser(ctx); // chain waits for this
  next();
});
```

> ⚠️ This is a **sequential pipeline**, not Express. An async middleware that returns a promise serializes the handlers after it. A sync middleware calling `next()` does not block at all (no microtask is paid).

## Order matters

Middleware is **baked into each route at registration time** (`router.ts:39-42`):

```ts
server.use(auth);      // applies to routes below
server.get("/api/*", …);
server.use(logger);    // does NOT apply to /api/* — it was already compiled
server.get("/public", …); // logger DOES apply here
```

Register middleware **before** the routes it should wrap.

## Sharing data between middleware and handlers

Use the lazy `ctx.state` object (allocated only if touched):

```ts
server.use((ctx, next) => {
  ctx.state.startedAt = performance.now();
  next();
});

server.get("/", ({ state, response }) => {
  response.json({ took: performance.now() - state.startedAt });
});
```

## WebSocket middleware

`use()` applies to **both** HTTP and WebSocket routes registered after it: `addWebSocketRoute` also composes `...this.middlewares, handler` (`router.ts:50-56`). The same `next()`-based middleware works for both:

```ts
server.use(({ socket, response }, next) => {
  // HTTP routes get `response`, WS routes get `socket`
  next();
});

server.ws("/live", ({ socket }) => {
  socket.send("welcome");
});
```

The type for a WS-only middleware is `WebSocketMiddleware` (`src/ws/types.ts`) — like a WS handler but with a **required** `next`, so it can run before the final handler and short-circuit. WS chains are compiled with `compileHandler` too.

## Built-in middleware

### `cors(options)` — `src/middleware/cors.ts`

```ts
server.use(cors({ allowOrigin: "*" }));

// stricter:
server.use(cors({
  allowOrigin: ["https://app.example.com", /^https:\/\/.*\.example\.com$/],
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["content-type", "authorization"],
  exposeHeaders: ["x-request-id"],
  allowCredentials: true,
  maxAge: 86400,
}));
```

| Option | Meaning |
|--------|---------|
| `allowOrigin` | `false` (none) · `true`/unset (echo origin or `*`) · string (fixed) · array/RegExp (match) |
| `allowMethods` | defaults to all `HTTP_METHODS` |
| `allowHeaders`, `exposeHeaders` | string or array |
| `allowCredentials` | sets `Access-Control-Allow-Credentials: true` |
| `maxAge` | sets `Access-Control-Max-Age` |

Preflights (`OPTIONS` + `Access-Control-Request-Method`) get an auto `204` and **short-circuit** the chain — your route handler is not called.

### `securityHeaders(options)` — `src/middleware/security-headers.ts`

```ts
server.use(securityHeaders());
```

Sets hardened defaults (`Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `X-Content-Type-Options: nosniff`, etc.), each disable-able with `false`.

## Composition & `compileHandler`

When you register N middlewares + a handler, they're compiled into **one function** via `compileHandler` — conditional `await`, shared `next` closure, short-circuit. Chains of 3+ compile measurably faster than a plain loop `[bench]`. See [Handler compilation](../http/handler-compilation.md) and [Benchmarking](../development/benchmarking.md).

## Best practices

- Keep middleware **synchronous when you can** — sync handlers pay zero microtasks.
- If a middleware can reject a request, reject **before** calling `next()` (and don't call it).
- Do body reads in route handlers, not middleware, unless you need them (body is lazy; touching it costs).
- Use `ctx.state` for per-request data instead of `Map`s or closures.
