# Compression

permessage-deflate lives in `src/ws/compression/`.

## Negotiation

Negotiation only proceeds if the client sent the extension AND the server option is set (`permessage-deflate.ts:25-60`, `includesExtension` `:191-199`).

- **`serverNoContextTakeover` + `clientNoContextTakeover` are always negotiated** (`:38`, `:54`) — the deflate context is reset after every message. Trade-off: a slightly worse compression ratio for **bounded memory** and the ability to interleave many connections.
- Defaults (`:13-16`): `threshold = 1024`, `level = 1` (fastest), `memLevel = 5`, `concurrencyLimit = 10`.

## Compressing (`PerMessageDeflateCompressor`, `:66-189`)

- One lazily-created `createDeflateRaw` with `Z_SYNC_FLUSH` for both flush and finish.
- `compress(payload)` **skips compression below `threshold`** (`:78-84`).
- Pending writes are buffered via `data`/`error` listeners.
- After flush, if `serverNoContextTakeover` → `deflate.reset()` (`:141-143`).
- **Sends the original uncompressed payload when compression doesn't shrink it** (`:147-153`) — no point paying decode cost for a bigger message.
- Strips the 4-byte sync-flush trailer (`trimSyncFlushTrailer`, `:201-208`).
- `close()` rejects any in-flight compression with a clear error (`:91-113`).

## Decompressing (`decompressMessage`, `inflate.ts:7-24`)

Appends the `SYNC_FLUSH_TRAILER = 0x00 0x00 0xff 0xff` (`permessage-deflate.ts:18`) to the payload and runs `inflateRawSync` with `finishFlush: Z_SYNC_FLUSH`. Any failure → `WebSocketProtocolError(InvalidFramePayloadData)`.

## Concurrency gate (`ZlibConcurrencyGate`)

`concurrency-gate.ts:4-26`: a token-semaphore capping concurrent zlib operations. **`getConcurrencyGate(limit)`** (`:28-42`) caches one gate per normalized limit in a module-level `Map`, so compressors with the same limit share a gate.

Why it exists: zlib is native and synchronous per call but `await`ed here. Unbounded concurrent compressions would starve the event loop, and per-message deflate contexts can't interleave safely. (This file is internal — not exported from `compression/index.ts`.)

## Cost accounting (why the queue matters)

Compressed sends go through `flushCompressedQueue` in the connection (single-flight, backpressured via `waitForDrain`). This keeps compression off the critical send path and bounds how many deflate operations are in flight at once. See [Connection](connection.md).
