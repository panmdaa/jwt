# HTTP/2 & TLS

## HTTPS (TLS)

```ts
import { readFileSync } from "node:fs";
import { Server } from "@panmdaa/server";

const server = new Server({
  tls: {
    key: readFileSync("./key.pem"),
    cert: readFileSync("./cert.pem"),
  },
});

server.get("/", ({ response }) => response.send("secure!"));
server.listen(443);
```

`tls` is passed straight to Node's `https.createServer` (or `http2.createSecureServer` when combined with `http2`). All `TlsOptions` apply.

## HTTP/2

```ts
const server = new Server({ http2: true });
```

- `{ http2: true }` → `http2.createServer` (h2c).
- `{ http2: true, tls }` → `http2.createSecureServer({ allowHTTP1: true, settings: { enableConnectProtocol: true } })` — **both HTTP/1.1 and HTTP/2 on the same TLS port**, negotiated via ALPN (`server/utils.ts:19-20`).

### Why it works with one code path

Node's native HTTP/2 request conversion would also consume extended CONNECT streams (WebSocket over HTTP/2), so the server **synthesizes** its own request/response wrappers (`createHttp2StreamRequest`, `Http2StreamResponse`) and runs the exact same pipeline as HTTP/1.1 (`server.ts:68-78`). HTTP/2 responses defer `stream.respond()` until the first write, so headers+status land together (`http2.ts:78-81`). See [HTTP/2](../http/http2.md).

## WebSocket over HTTP/2 (extended CONNECT)

With `http2: true`, `server.ws()` works over `:protocol: websocket` CONNECT streams automatically — the `WebSocketUpgrader.handleStream` intercepts them before the regular request path (`websocket.ts:67-93`).

> ⚠️ **Client compatibility**: most WebSocket clients only do HTTP/1.1. A browser WebSocket or the `ws` library talking to an `http2: true` endpoint will typically negotiate HTTP/1.1 via ALPN. If you need h2 WebSockets, use a client that supports extended CONNECT.

## Verification

```sh
curl --http2 https://localhost:3000/
openssl s_client -connect localhost:3000 -alpn h2,http/1.1
```

Test fixtures (`test/fixtures/key.pem`, `cert.pem`) are used by the test suite — see [Testing](../development/testing.md).
