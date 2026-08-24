# Quick start

Five minutes to a running server.

## Install

```sh
npm install @panmdaa/server
```

Requires Node.js >= 18 (`package.json` `engines`). Pure ESM — use `import`, not `require`.

## Your first server

```ts
import { Server } from "@panmdaa/server";

const server = new Server();

server.get("/", ({ response }) => {
  response.send("Hello, world!");
});

server.get("/user/:id", ({ params, response }) => {
  response.json({ id: params.id });
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}/`);
```

## What just happened

- `new Server()` creates a native `http.createServer` under the hood (`src/http/server/utils.ts`).
- `server.get("/", handler)` registers a static route. The handler receives a **context** with typed `params` — `/user/:id` gives you `params.id: string` (compile-time checked via the `Path` type).
- `response.send()` / `response.json()` write the response. If your handler doesn't write, the server **auto-ends** it for you (`server.ts:116-145`).

## Reading the request

```ts
server.post("/login", async ({ body, response }) => {
  const { email, password } = await body.json();
  // ...
  response.json({ ok: true });
});
```

`body` is lazy and cached: `json()`, `text()`, `raw()`, `formData()`, `arrayBuffer()`, `stream()` — call the one you need, once. See [Body](http.md#body).

## Middleware

```ts
server.use(({ response }, next) => {
  response.header("x-powered-by", "panmdaa");
  next();
});

server.get("/", ({ response }) => response.send("hi"));
```

Middleware applies to routes registered **after** it. See [Middleware](middleware.md).

## WebSocket

```ts
server.ws("/live", ({ socket }) => {
  socket.send("welcome!");
  socket.on("message", ({ data }) => socket.send(`echo: ${data}`));
});
```

WebSocket routes match by **path only** and live in a separate tree — `/*` won't shadow HTTP routes. See [WebSockets](websockets.md).

## Errors

Throw `HttpError` subclasses (or build your own) and the server maps them:

```ts
import { NotFound } from "@panmdaa/server";

server.get("/teapot", () => {
  throw new NotFound();
});
```

See [Errors](http.md#errors).

## Next steps

- [HTTP](http.md) — routes, query, body, responses in depth.
- [Best practices](best-practices.md) — structuring a real app.
