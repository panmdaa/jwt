# Built-in middleware

Two middleware factories ship in `src/middleware/`. Both are factories — `app.use(cors({…}))` — and both only touch `response` lazily.

## `cors(options)` (`cors.ts:17-59`)

Pre-computes `allowMethods` (default: all `HTTP_METHODS`), `allowHeaders`, `exposeHeaders` (`cors.ts:18-21`). Per request:

1. Resolves `Access-Control-Allow-Origin` via `resolveAllowedOrigin` (`:71-88`):
   - `false` → no origin header.
   - `undefined` / `true` → echo the request origin or `*`.
   - `string` → fixed value.
   - `array` / `RegExp` → match against the origin.
2. Sets `Vary: origin` when the origin is origin-dependent.
3. Sets credentials / methods / expose / max-age headers.
4. **Preflight**: if `OPTIONS` + `Access-Control-Request-Method` present → sets `allow-headers`, `status = 204`, `response.end()` and **short-circuits without calling `next()`** (`cors.ts:47-55`). This relies on the compiled chain's `next` contract: no `next()` → chain stops.

```ts
app.use(cors({ allowOrigin: "*" }));
```

## `securityHeaders(options)` (`security-headers.ts:16-49`)

Sets a hardened default set, each disable-able with `false`:

| Header | Default |
|--------|---------|
| `X-DNS-Prefetch-Control` | `off` |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |

Always calls `next()`.

```ts
app.use(securityHeaders());
```

## Writing your own middleware

A middleware is just `(ctx, next) => …`:

```ts
app.use((ctx, next) => {
  ctx.state.startedAt = performance.now();
  next();
});
```

Two contracts to remember (see [Handler compilation](../http/handler-compilation.md)):

1. **Not calling `next()` terminates the chain** — that's how `cors` short-circuits preflights.
2. **Returning a promise before calling `next()` blocks the rest of the chain** — async middleware must `await` its work, then call `next()` (or not).
