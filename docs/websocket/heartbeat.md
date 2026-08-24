# Heartbeat

`WebSocketHeartbeat` (`src/ws/heartbeat/heartbeat.ts`) keeps dead connections from accumulating.

## How it works

```ts
const heartbeat = createWebSocketHeartbeat({
  intervalMs: 30_000,   // default
  timeoutMs: 10_000,    // default
  closeCode: CloseCode.GoingAway,
  closeReason: "Heartbeat timeout",
});
```

1. A `setInterval(tick, intervalMs)` runs, **`unref()`'d** (`heartbeat.ts:29-33`) so an idle server can exit.
2. `track(socket)` attaches one-shot `pong` (clears `awaitingPong`) and `close` (untrack) listeners, plus per-socket `{ awaitingPong, deadlineAt }` state (`:35-59`).
3. `tick()` (`:81-117`):
   - Untracks sockets that are no longer `OPEN`.
   - If awaiting a pong **past `deadlineAt`** → `socket.close(closeCode, closeReason)`, falling back to `terminate()` on throw.
   - Otherwise pings and sets the deadline.

## When to use it

WebSockets are long-lived; without a heartbeat, a dead TCP connection (dropped network, powered-off client) stays in the app's socket list forever. With the heartbeat, an unresponsive connection is closed after `intervalMs + timeoutMs`.

## Event wiring

- `heartbeat.track(socket)` must be called from your WS handler (or middleware): `server.ws("/*", ({ socket }) => heartbeat.track(socket))`.
- The heartbeat does not interfere with manual `close()`/`terminate()` — a closed socket is untracked via its `close` listener.
