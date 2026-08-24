# HTTP/2

`@panmdaa/server` runs over Node's `http2` module when `ServerOptions.http2` is set, with `enableConnectProtocol: true` so extended CONNECT (WebSocket over HTTP/2) works.

## Transport setup

```ts
new Server({ http2: true })              // h2c
new Server({ http2: true, tls })         // h2 over TLS, allowHTTP1 for ALPN fallback
```

The HTTP/2 servers are created **without a request handler** (`server/utils.ts:19-20`) so `Server` intercepts every stream.

## Stream handling

`Server.handleStream` (`server.ts:68-78`):

1. `WebSocketUpgrader.handleStream(stream, headers)` is tried first — if the stream is an extended CONNECT (`:method: CONNECT`, `:protocol: websocket`), it's consumed by the WS stack and `handleStream` returns `true`.
2. Otherwise, a regular HTTP/2 request is synthesized and the normal request path runs.

## Synthesized request/response

Node's native HTTP/2 request/response conversion would also consume extended CONNECT streams, so the server hand-builds its own (`ws/http2/http2.ts`):

- `isExtendedConnectWebSocketRequest(headers)` (`:23-33`): `:method === CONNECT` && `:protocol === websocket`.
- `createHttp2StreamRequest` (`:41-75`): a minimal `ServerRequest` — headers (host from `:authority`), `httpVersion: "2.0"`, method/url from pseudo-headers, `socket` from `stream.session.socket`, event methods delegating to the stream.
- `Http2StreamResponse extends Writable` (`:82-168`): **defers `stream.respond()` until the first `_write`/`_final`/`writeHead`** (`:78-81`), mirroring `ServerResponse` semantics. Headers are stored lowercased in a `Map` and emitted as `:status` + entries on respond.

Because `Http2StreamResponse` behaves like a `ServerResponse`, the whole HTTP pipeline (context, auto-finish, error path) works unchanged.

## WebSocket over HTTP/2

- `acceptExtendedConnectWebSocket` (`ws/handshake/handshake.ts:235-301`): validates `:method: CONNECT` (405 otherwise), `:protocol: websocket` (400), version 13, runs session checks, then `stream.respond({ ":status": 200, ... })`.
- Response headers are sanitized: lowercased, forbidden header set dropped (`HTTP2_FORBIDDEN_RESPONSE_HEADERS`, `handshake.ts:21-27`).
- `rejectExtendedConnect` (`:97-120`) responds with an error status and ends/closes the stream.
