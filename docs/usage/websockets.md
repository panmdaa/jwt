# WebSockets

Real-time routes. They live in their **own routing tree** — matched by path only, never by method, so `server.ws("/*")` won't shadow HTTP routes.

## Basic echo

```ts
server.ws("/live", ({ socket }) => {
  socket.send("welcome!");
  socket.on("message", ({ data, isBinary }) => {
    socket.send(isBinary ? data : `echo: ${data}`);
  });
});
```

## Receiving

The `socket` is a `WebSocketConnection` (an event emitter). Events:

| Event | Payload | When |
|-------|---------|------|
| `message` | `{ data: string \| Uint8Array, isBinary }` | any text or binary message (fragments assembled first) |
| `text` | `string` | text messages |
| `binary` | `Uint8Array` | binary messages |
| `ping` / `pong` | `Uint8Array` | control frames |
| `close` | `{ code, reason, wasClean }` | **exactly once** per connection |
| `error` | `Error` | protocol errors etc. |
| `drain` | — | underlying socket writable again |

Messages are **UTF-8 validated** by default (`isUtf8`) unless `skipUTF8Validation`; decompressed payloads are re-checked against `maxPayload` (decompression-bomb protection).

## Sending

```ts
socket.send("hello");                 // text
socket.send(new Uint8Array([1,2,3])); // binary (auto-detected)
socket.sendText("hi");                // explicit
socket.sendBinary(buffer);            // explicit
socket.ping();                        // 125-byte control limit enforced
socket.pong();
```

Text sends are optimized (no `Buffer.from`, coalesced under `cork`); binary sends are coalesced too. See [Frames](../websocket/frames.md).

## Closing

```ts
socket.close(1000, "bye");           // graceful — close frame + handshake
socket.close(CloseCode.NormalClosure, "done");
socket.terminate();                  // hard kill — destroys the socket immediately
```

- `close(code?, reason?)` is idempotent; code must be a valid close code (1000–1015 or 3000–4999), reason ≤ 123 bytes.
- After the close frame is sent, a `closeTimeout` (default 5s) timer **aborts** the handshake with `terminate()` if the peer never completes it — and it's `unref()`'d.
- `close` event gives you `wasClean` (true if either side sent a close frame).

## Options

WebSocket behavior is configured **at the server level** via `ServerOptions.websocket` (a shared `WebSocketRouteOptions`) — there is no per-route options argument on `ws()` (`server.ts:32-36`, `websocket.ts:95-102`):

```ts
const server = new Server({
  websocket: {
    maxPayload: "8mb",
    perMessageDeflate: { threshold: "1kb", level: 3 },
  },
});
```

### `WebSocketRouteOptions`

| Option | Meaning |
|--------|---------|
| `verifyClient` | async/sync → `boolean` or `{ ok, status?, message?, headers? }`; rejection → refused upgrade |
| `protocols` | `readonly string[]` offered by the server; the first match wins |
| `handleProtocols` | full control: `(protocols: Set, request) => protocol \| false \| undefined` |
| `perMessageDeflate` | `boolean` or `{ level?, memLevel?, threshold?, concurrencyLimit? }` |
| `maxPayload` | `SizeInput` — number or `"8mb"` style string (`ws/utils.parseSize`) |
| `headers` | object or async fn → extra response headers on the 101 |
| `autoPong` | auto-reply to pings (default true) |
| `skipUTF8Validation` | skip the UTF-8 check on text (default false) |
| `closeTimeout` | ms before an uncompleted close handshake is aborted (default 5000) |

## Heartbeat

Dead connections (dropped network, powered-off clients) never send a close frame. Track sockets to close them after a timeout:

```ts
import { createWebSocketHeartbeat } from "@panmdaa/server";

const heartbeat = createWebSocketHeartbeat({ intervalMs: 30_000, timeoutMs: 10_000 });

server.ws("/*", ({ socket }) => {
  heartbeat.track(socket);
  // …
});
```

An unresponsive connection is closed with `GoingAway` ("Heartbeat timeout") after `intervalMs + timeoutMs`. Timers are `unref()`'d. See [Heartbeat](../websocket/heartbeat.md).

## Advanced: HTTP/2

With `http2: true`, WebSockets work over extended CONNECT (`:protocol: websocket`). Client compatibility varies — most WS clients only do HTTP/1.1. See [HTTP/2 & TLS](http2.md).

## Notes on behavior

- **No rooms/channels** — implement them in your app (a `Map<room, Set<socket>>`). The library deliberately doesn't ship this.
- **Broadcast** = `for (const ws of sockets) ws.send(...)`. For many clients, batch with `cork` or use your own fan-out.
- The handshake validates strictly (RFC 6455): `Sec-WebSocket-Key`, version 13, `Connection: Upgrade`. Malformed upgrades get raw-text rejections (400/405). See [WebSocket lifecycle](../websocket/lifecycle.md).
- Leftover bytes after the upgrade are re-fed into the socket, so a client sending a frame in the same packet as the upgrade works.
