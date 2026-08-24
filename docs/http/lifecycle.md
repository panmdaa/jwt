# HTTP lifecycle

What happens from the moment a TCP connection delivers a request to the moment the response is on the wire.

## Server creation

`new Server(options?)` (`src/http/server/server.ts:24`) builds a native Node server based on options (`src/http/server/utils.ts:14-34`):

| Options | Transport |
|---------|-----------|
| `http2 + tls` | `http2.createSecureServer({ allowHTTP1: true, settings: { enableConnectProtocol: true } })` |
| `http2` | `http2.createServer({ settings: { enableConnectProtocol: true } })` |
| `tls` | `https.createServer(tls, handler)` |
| neither | `http.createServer(handler)` |

The HTTP/2 variants are created **without a request handler** so `Server` intercepts every stream — it must decide per stream whether it's an extended CONNECT (WebSocket) or a regular request.

## Event wiring

`Server` registers:

- **`request`** (HTTP/1.1, and the http2 ALPN fallback) → `this.request(req, res)` (`server.ts:36-44`).
- **`stream`** (http2) → `handleStream` (`server.ts:46-50`).
- **`upgrade`** (HTTP/1.1 WebSocket) → `this.websocket.handleUpgrade(req, socket, head)` (`server.ts:51-53`).

## HTTP/2 stream handling

`handleStream` (`server.ts:68-78`):

1. Ask `WebSocketUpgrader.handleStream` — if it consumed the stream (extended CONNECT), stop.
2. Otherwise synthesize an HTTP/1-like `ServerRequest` (`createHttp2StreamRequest`) and a `Http2StreamResponse` wrapper, then run the normal request path.

This is why HTTP/1 and HTTP/2 share one request pipeline.

## Request flow

```
http.IncomingMessage          Server.request (server.ts:147)
        │
        ├─ find(method, url) ──────────────► Router/RadixTree (query stripped inside)
        │
        ├─ hit ─► createContext(method, …) ─► body? ContextBodyHandler
        │         │                             no?  ContextHttpHandler
        │         ▼
        │      run(handler, context) (server.ts:116)
        │         │
        │         ├─ promise? ─► response.end() on settle, catch ► handleError
        │         └─ sync     ─► response.end() immediately
        │
        ├─ HEAD, no HEAD route ─► run GET
        ├─ OPTIONS, no route ──► 200 + Allow (methods(url)) + Content-Length: 0
        ├─ other methods match ─► 405 + Allow
        └─ nothing ───────────► 404
```

### `createContext` (`server.ts:84-114`)

Methods that may carry a payload — `POST, PUT, PATCH, DELETE, QUERY` — get `ContextBodyHandler(params, search, request, response, maxBodySize)`. Everything else gets `ContextHttpHandler`. This keeps `GET` handlers free of the body surface.

### `run` (`server.ts:116-145`)

Calls `handler.store(context, NO_OP)`, then:

- If it returned a promise → `.then` auto-`response.end()` if not already ended, `.catch` → `handleError`.
- If synchronous → auto-end immediately.

The comment at `server.ts:132-134` says it best: *"Only async handlers allocate a promise here."* This is the auto-response behavior: a handler that only writes headers still gets the response closed. The `response.writableEnded` check works for both HTTP/1 and the http2 wrapper.

## Error path

`handleError` (`server.ts:203-235`):

1. Invoke the `onError` hook inside a try/catch — "never let the error hook itself take the process down" (`server.ts:206-209`).
2. Bail if the response was already committed.
3. `HttpError` → its `status`/`message`/`description`.
4. Anything else → `500 Internal Server Error`.

404/405/500 bodies are JSON `{ status, message }` with `application/json; charset=utf-8` (`JSON_CONTENT_TYPE`, `server.ts:19`).

## Transport details

- Headers-only responses (no explicit body) end with `Content-Length` computed by Node (`response.ts:58-68`) — never `chunked` when the size is known (`response.ts:70-82`).
- `maxBodySize` (default 16 MiB) → `PayloadTooLarge` (413) as soon as the accumulated body exceeds it (`body/utils.ts:37-40`).
