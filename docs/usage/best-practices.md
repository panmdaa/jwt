# Best practices

How to structure a real app with `@panmdaa/server` the way it was designed to be used.

## 1. Compose routers, don't grow one file

```ts
// routes/users.ts
import { Router } from "@panmdaa/server";
export const users = new Router();
users.get("/", listUsers);
users.get("/:id", getUser);
users.post("/", createUser);

// routes/chat.ts
import { Router } from "@panmdaa/server";
export const chat = new Router();
chat.ws("/live", chatHandler);

// app.ts
import { Server } from "@panmdaa/server";
import { users } from "./routes/users";
import { chat } from "./routes/chat";

const server = new Server();
server.router("/api/users", users);
server.router("/api/chat", chat);
server.listen(3000);
```

`Router` is framework-agnostic — build and test routers without a server. Attach them with `server.router(prefix, router)` or `server.group(prefix, fn)`. Handlers are re-registered into the parent tree once.

## 2. Register middleware BEFORE the routes it wraps

Middleware is baked into each route at registration time (`router.ts:39-42`):

```ts
server.use(cors({ allowOrigin: "*" }));
server.use(securityHeaders());
server.use(authenticate);
server.use(requestLogger);

server.router("/api", apiRouter);   // gets all four
```

Anything registered after won't retroactively apply.

## 3. Keep middleware synchronous when possible

Sync middleware pays **zero microtasks** (conditional await in `compileHandler`). Only `await` when you must (auth DB lookup, session load). And remember: an async middleware that returns a promise **serializes** the chain after it — it's a sequential pipeline, not Express. See [Middleware](middleware.md).

## 4. Use `ctx.state` for per-request data

```ts
server.use(async (ctx, next) => {
  ctx.state.user = await findUser(ctx.headers.authorization);
  next();
});
server.get("/me", ({ state, response }) => {
  response.json(state.user);
});
```

`state` is lazy — allocated only if a handler touches it.

## 5. Throw typed errors, don't hand-build 500s

```ts
import { NotFound, BadRequest } from "@panmdaa/server";

server.get("/user/:id", async ({ params, response }) => {
  const user = await db.findUser(params.id);
  if (!user) throw new NotFound();
  response.json(user);
});
```

Unknown errors become 500 automatically. Log everything through `onError`:

```ts
const server = new Server({
  onError: (error) => console.error(error),
});
```

## 6. Read the body once, lazily

`ctx.body` representations are cached. Read the one you need, once:

```ts
server.post("/api/items", async ({ body, response }) => {
  const item = await body.json();
  response.status = 201;
  response.json({ created: item });
});
```

Don't parse the body in middleware for routes that don't need it — parsing is lazy and per-route.

## 7. WebSocket: track, broadcast, close

```ts
import { createWebSocketHeartbeat } from "@panmdaa/server";

const clients = new Set();
const heartbeat = createWebSocketHeartbeat();

server.ws("/live", ({ socket }) => {
  clients.add(socket);
  heartbeat.track(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("message", ({ data }) => {
    for (const client of clients) client.send(data);
  });
});
```

- **Always `heartbeat.track()`** long-lived sockets — dead peers never close the connection otherwise.
- There's no room/channel system — a `Set`/`Map` is the idiomatic approach.
- Batch fan-out sends if you're broadcasting to hundreds of sockets.

## 8. Set limits that match your threat model

```ts
const server = new Server({
  maxBodySize: "1mb",
  websocket: {
    maxPayload: "64kb",
    perMessageDeflate: { threshold: "256b" },
  },
});
```

`maxBodySize` guards HTTP; `maxPayload` guards WS messages — including the **inflated** size (decompression bombs). Enable `perMessageDeflate` only for text-heavy, low-latency traffic (it adds CPU; `level: 1` is the sane default).

## 9. Let the router be lazy

Build the server at startup and let routes register once. The radix tree compiles on first request (lazy build) — there's no need to "warm" it manually, but avoid registering routes in the request path.

## 10. Don't fight auto-finish

If your handler doesn't write, the server ends the response for you. So:

```ts
server.get("/health", ({ response }) => {
  response.status = 204;   // done — server auto-ends, no body
});
```

Only call `response.end()` yourself when you need explicit control (streams, long-polling).

## Checklist for a new feature

- [ ] Routes composed into `Router`s, mounted with `server.router`/`group`
- [ ] Middleware registered before the routes it affects
- [ ] Sync middleware unless `await` is required
- [ ] Typed errors thrown; `onError` wired
- [ ] Body read once, in the route handler
- [ ] WS sockets tracked + heartbeat
- [ ] Limits set (`maxBodySize`, `maxPayload`)
- [ ] `typecheck` + `test` pass before commit
