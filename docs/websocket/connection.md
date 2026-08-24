# Connection

`WebSocketConnection` (`src/ws/connection/connection.ts`) is the client-facing state machine. It extends `TypedEventEmitter<WebSocketEvents>` (`connection.ts:53`).

## State

`WebSocketState` (`ws/constants.ts:5-10`):

| State | Meaning |
|-------|---------|
| `CONNECTING` | handshake done, before open |
| `OPEN` | frames flowing |
| `CLOSING` | close frame sent/received, waiting |
| `CLOSED` | socket dead |

Private state includes a concatenation buffer, a reusable `ParsedFrame`, fragmentation state, close state (`hasReceivedCloseFrame`/`hasSentCloseFrame`/`hasReportedClose`), a compression queue, `pendingCloseFrame`, `closeTimer`, and `readyStateValue`.

## Sending

| Method | Notes |
|--------|-------|
| `send(data)` | text fast-path `writeTextFrame` when no compression, else generic `writeFrame` (`connection.ts:138-161`) |
| `sendText` / `sendBinary` | typed sends |
| `ping` / `pong` | enforce the 125-byte control limit with `RangeError` (`:163-191`) |
| `close(code?, reason?)` | idempotent (state ≥ CLOSING returns); validates code (`isValidCloseCode`) and reason ≤ 123 bytes; if compressed frames are pending, **defers** the close frame to `pendingCloseFrame` and flushes the queue first (`:193-222`) |
| `terminate()` | closes compressor, drops queue, `raw.destroy()` (`:224-232`) — the hard kill |

### Write paths

- **Uncompressed data frames**: `cork()`/`uncork()` around header + payload writes — two writes coalesced into one kernel write, avoiding the `buildFrame` copy (`connection.ts:586-592`).
- **Uncompressed text**: `writeTextFrame` writes header + string payload under cork, avoiding the `Buffer.from` conversion entirely (`connection.ts:599-612`).
- **Compressed frames**: `enqueueCompressedFrame` → single-flight async `flushCompressedQueue`: compress (await) → write → if the socket was unwritable, `await waitForDrain` (backpressure, `:647-649`). When the queue drains, a pending close frame is finally written (`:662-669`).

## Receiving

`handleChunk` (`connection.ts:290-318`) appends, loops `parseFrameInto`, and dispatches via `handleFrame` (`:320-355`):

- **Text/Binary** → fragmentation assembly → `emitMessage` (inflate if compressed; UTF-8 validation via native `isUtf8` unless `skipUTF8Validation`; `message` + `text`/`binary` events).
- **Ping** → emits `ping`; auto-pongs if `autoPong` and OPEN (`:337-342`).
- **Continuation** without a start frame → protocol error. Continuation must not set RSV1.
- **Close** → `handleCloseFrame` (`:452-500`): 1-byte payload → error; reads code + reason (validated); echoes a Close frame **once** (empty echo → `NormalClosure`), then CLOSING and `raw.end()`.

### Fragmentation

`ensurePayloadLimit` checks the **accumulated** length (`:372-373, :396`) — the `maxPayload` limit applies to the whole message, not per frame. The **inflated** size is re-checked in `inflateMessage` (`:559-569`) as decompression-bomb protection.

## Close handshake

`writeCloseFrame` (`connection.ts:680-688`): sets `hasSentCloseFrame`, writes the frame, starts `closeTimer = setTimeout(terminate, closeTimeout)` — **`unref()`'d** ("grace period before a closing handshake is aborted", `constants.ts:82`) — then `raw.end()`.

`handleClose` (`:502-531`) is the **single-emit guard**: both `close` and `end` can fire, so `hasReportedClose` ensures exactly one `close` event, with `{ code, reason, wasClean: hasReceivedCloseFrame || hasSentCloseFrame }` (`:524-530`).

## Failing

`fail(error)` (`connection.ts:270-288`) is the RFC 6455 "fail the WebSocket connection" routine: emits `error`, sends a Close frame with the protocol error's close code (once), then destroys.

## Close codes

- `CloseCode` (`constants.ts:29-45`) — with 1004/1005/1006/1015 reserved (never sent on the wire, `constants.ts:24-28`).
- `isValidCloseCode` (`frame/close-code.ts:7-23`): standard codes or 3000–4999.
- `SENDABLE_CLOSE_CODES` (`constants.ts:48-58`).
- Limits: `MAX_PAYLOAD_LENGTH_7BIT = 125`, `MAX_PAYLOAD_LENGTH_16BIT = 65_535`, `MAX_CONTROL_PAYLOAD = 125`, `MAX_CLOSE_REASON_BYTES = 123`.

## Defaults

`createWebSocket` (`connection/create.ts:7-21`): `autoPong: true`, `closeTimeout: DEFAULT_CLOSE_TIMEOUT (5000)`, `maxPayload: DEFAULT_MAX_PAYLOAD (16 MiB)`, `skipUTF8Validation: false`.

## Events

`WebSocketEvents` (`ws/types.ts:81-90`): `binary`, `close`, `drain`, `error`, `message`, `ping`, `pong`, `text` — typed tuples over the base `TypedEventEmitter` (`typed-emitter.ts:10-38`).
