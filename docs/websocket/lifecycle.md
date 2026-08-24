# WebSocket lifecycle

The upgrade path is owned by `WebSocketUpgrader` (`src/http/server/websocket.ts`) and the handshake by `src/ws/handshake/handshake.ts`.

## Entry points

- **HTTP/1.1**: Node emits `upgrade` → `WebSocketUpgrader.handleUpgrade(req, socket, head)` (`websocket.ts:39-61`).
- **HTTP/2**: `Server.handleStream` → `WebSocketUpgrader.handleStream(stream, headers)` — returns `false` for regular requests, `true` once it consumed an extended CONNECT stream (`websocket.ts:67-93`).

## HTTP/1.1 upgrade flow

```
upgrade event
  └─ findWebSocket(url) ──► no route ──► rejectUpgrade(404)
  └─ wrap request (createWebSocketRequest)
  └─ upgradeWebSocket(request, socket, head, route)     (handshake.ts:122-233)
       ├─ validate: GET? upgrade: websocket? connection token? key? version 13?
       ├─ prepareWebSocketSession(verifyClient, protocols, deflate, headers)
       ├─ accept = sha1(key + GUID) base64
       ├─ write 101 + headers as one raw string (flush.ts)
       └─ createWebSocket(socket, options)
  └─ socket.unshift(head)  ← leftover bytes after the upgrade are put back (handshake.ts:211-217)
  └─ runWebSocketHandler(connection, match, request)   (websocket.ts:104-128)
       └─ build ContextWSHandler(socket, params, search, request)
       └─ match.store.handler(ctx)   ← the already-composed chain
       └─ async reject / sync throw ─► socket.terminate() + onError hook
```

### Validation order (each failing with a raw-text rejection)

1. Method must be GET → 405 (`handshake.ts:128-131`).
2. `upgrade: websocket` (case-insensitive) → 400 (`:138-141`).
3. `connection` token list contains `upgrade` → 400 (`:143-151`).
4. `Sec-WebSocket-Key` matches `/^[+/0-9A-Za-z]{22}==$/` → 400 (`:30`, `:153-156`).
5. Version must be `13` → 400 with `Sec-WebSocket-Version: 13` (`:158-168`).
6. `prepareWebSocketSession` (verifyClient, protocol negotiation, deflate negotiation, extra headers) → session status (`:170-180`).
7. `accept = sha1(key + GUID).base64`, GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` (`:20`, `:182-184`).

### Response ordering

Status line → `Connection: Upgrade` → `Upgrade: websocket` → `Sec-WebSocket-Accept` → `Sec-WebSocket-Protocol` → `Sec-WebSocket-Extensions` → sanitized user `extraHeaders` (`handshake.ts:185-206`). Written as one raw string (there is no `ServerResponse` inside `upgrade`), then `writeHandshake` verifies the bytes actually landed (see `flush`).

### `head` bytes

Bytes left over after the upgrade request are `socket.unshift(head)`'d (`handshake.ts:211-217`) so the connection's `data` listener parses them as the first frames — this is why a client can send a frame in the same packet as the upgrade.

## Handler dispatch

`runWebSocketHandler` builds a `ContextWSHandler(socket, params, search, request)` and invokes `match.store.handler(ctx)` (`websocket.ts:104-128`). That handler is the **already-composed chain** — middlewares + WS handler compiled at registration (`router.ts:50-56`). Async rejections and sync throws both call `socket.terminate()` + the `onError` hook.

## Failed upgrades

- `rejectUpgrade` writes `HTTP/1.1 <status> <message>` with `Connection: close`, `Content-Length`, `text/plain` — destroys if the socket isn't writable (`handshake.ts:70-95`).
- HTTP/2: `rejectExtendedConnect` responds and closes the stream (`:97-120`).
- `handleWebSocketError` (an error thrown during handshake/session prep) runs the `onError` hook and destroys the socket (`websocket.ts:142`).

## After the 101

The socket is handed to `createWebSocket` (defaults applied in `ws/connection/create.ts`), and `WebSocketConnection` takes over: zero-alloc frame parsing, events, close handshake. See [Connection](connection.md).
