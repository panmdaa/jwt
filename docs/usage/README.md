# Usage

This is the **how-to** for `@panmdaa/server`: practical guides on using the library the way it was designed to be used.

## Reading order

| Guide | What you'll learn |
|-------|-------------------|
| [Quick start](getting-started.md) | Install, first server, routing, responding |
| [HTTP](http.md) | Routes, params, query, body, response, errors |
| [Middleware](middleware.md) | Custom middleware, cors, securityHeaders, composition |
| [WebSockets](websockets.md) | Upgrade, events, close handshake, heartbeat, verifyClient, protocols |
| [HTTP/2 & TLS](http2.md) | h2, ALPN, extended CONNECT |
| [Configuration & limits](configuration.md) | `ServerOptions`, `maxBodySize`, WebSocket options |
| [Best practices](best-practices.md) | The "ideal" way to structure an app with this library |

For the internals (why things work this way, what runs when), see the [architecture](../architecture/overview.md) docs. Every guide links to the relevant reference doc.

## Key concepts in one minute

```ts
import { Server } from "@panmdaa/server";

const server = new Server();

server.get("/user/:id", ({ params, response }) => {
  response.send(`Hello ${params.id}!`);
});

server.listen(3000);
```

- `new Server(options?)` starts with nothing and mounts onto Node's `http`/`https`/`http2` transport.
- `server.use(mw)` registers middleware for routes added **after** it.
- `server.get/post/put/delete/patch/options/head/all/query/ws` register routes. Each receives a typed context.
- `ctx.response.send(...)` auto-completes the request; if you don't write, the server auto-ends.
- `ctx.body` (JSON, form, raw, stream) is available only on body-capable routes (`POST/PUT/PATCH/DELETE/QUERY`).
- WebSockets live in their own tree: `server.ws("/path", handler)`.

**One entry point**: everything — `Server`, `Router`, middleware, WebSockets, errors — is exported from `@panmdaa/server`. See [Development](../development/tooling.md).
