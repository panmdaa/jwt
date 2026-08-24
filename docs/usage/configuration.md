# Configuration & limits

Everything you can configure on the server and its WebSocket stack.

## `ServerOptions` (`src/http/server/types.ts`)

```ts
interface ServerOptions {
  /** Enable HTTP/2. With `tls`, HTTP/1.1 + HTTP/2 share the TLS port via ALPN. */
  http2?: boolean;
  /** TLS options. When present, the server serves HTTPS. */
  tls?: TlsOptions;
  /** Max request body bytes; overflow → PayloadTooLarge (413). */
  maxBodySize?: number;
  /** Hook invoked with any error thrown while handling a request. */
  onError?: (error: unknown) => void;
  /** Shared options applied to every WebSocket route on this server. */
  websocket?: WebSocketRouteOptions;
}
```

```ts
const server = new Server({
  http2: true,
  tls: { key, cert },
  maxBodySize: "2mb",      // SizeInput — numbers or "2mb" strings
  onError: (error) => console.error(error),
  websocket: {
    maxPayload: "8mb",
    perMessageDeflate: true,
  },
});
```

## `maxBodySize`

- Default body limit: **16 MiB** (`DEFAULT_MAX_PAYLOAD`, `ws/constants.ts:80`).
- Accepts a `SizeInput`: plain number (bytes) or string like `"2mb"`, `"512kb"` (parsed by `parseSize`, `ws/utils.ts`).
- The body is rejected with `PayloadTooLarge` (413) **as soon as** the accumulated size exceeds the limit — while streaming, not after the whole request (`body/utils.ts:37-40`).

## `onError`

Runs for **both** HTTP and WebSocket errors, before any response is produced:

- HTTP: before the 4xx/5xx JSON response.
- WebSocket: during handshake failures and handler throws (then the socket is destroyed/terminated).

It's wrapped in a try/catch — a throwing hook can never take the process down (`server.ts:206-209`). It's where you'd plug in logging/error tracking.

## `websocket` (WebSocketRouteOptions)

Shared by every WS route (there is **no per-route options argument** on `ws()`):

| Option | Type / default | Meaning |
|--------|----------------|---------|
| `autoPong` | `boolean` (true) | auto-reply to ping frames |
| `closeTimeout` | `number` (5000) | ms before an uncompleted close handshake is aborted with `terminate()` |
| `headers` | object \| async fn | extra response headers on the 101 upgrade |
| `handleProtocols` | `(protocols: Set, request) => protocol \| false \| undefined` | full subprotocol negotiation control |
| `maxPayload` | `SizeInput` (16 MiB) | max message size; applies to whole fragmented messages and to **inflated** size (decompression-bomb protection) |
| `perMessageDeflate` | `boolean \| PerMessageDeflateOptions` (off) | permessage-deflate compression |
| `protocols` | `readonly string[]` | subprotocols the server offers; first match wins |
| `skipUTF8Validation` | `boolean` (false) | skip the `isUtf8` check on text messages |
| `verifyClient` | `(request) => boolean \| { ok, status?, message?, headers? }` | gate the upgrade (auth, origin checks) |

### `perMessageDeflate` tuning

```ts
websocket: {
  perMessageDeflate: {
    level: 1,           // 0-9, 1 = fastest (default)
    memLevel: 5,        // zlib memory (default)
    threshold: "1kb",   // skip compression below this size (default 1024)
    concurrencyLimit: 10, // max concurrent zlib ops (default)
  },
}
```

- `serverNoContextTakeover`/`clientNoContextTakeover` are always negotiated — the context resets per message (bounded memory, at the cost of compression ratio).
- Payloads that don't shrink are sent uncompressed.
- See [Compression](../websocket/compression.md).

### `verifyClient` example

```ts
const server = new Server({
  websocket: {
    verifyClient: ({ headers }) =>
      headers.authorization === "Bearer secret" || { ok: false, status: 403, message: "Forbidden" },
  },
});
```

### Subprotocols

```ts
const server = new Server({
  websocket: { protocols: ["chat.v1", "chat.v2"] },
});
server.ws("/live", ({ socket }) => { … });
```

The client requests protocols in its `Sec-WebSocket-Protocol` header; the server picks the first of its own that the client also offered (or uses `handleProtocols` for full control). The selected protocol is exposed on the connection's `protocol` option.

## Quick reference table

| Config | Where | Default |
|--------|-------|---------|
| Body size limit | `ServerOptions.maxBodySize` | 16 MiB |
| Message size limit | `ServerOptions.websocket.maxPayload` | 16 MiB |
| Close handshake grace | `ServerOptions.websocket.closeTimeout` | 5000 ms |
| Compression | `ServerOptions.websocket.perMessageDeflate` | off |
| Heartbeat interval/timeout | `createWebSocketHeartbeat({ intervalMs, timeoutMs })` | 30s / 10s |
| Auto-pong | `ServerOptions.websocket.autoPong` | true |
