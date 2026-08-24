# Frames

Frame parsing and building live in `src/ws/frame/`.

## Parsing — `parseFrameInto`

`parseFrameInto(buffer, out, options): number | null` (`parser.ts:28-106`) is the **allocation-free hot path**: it writes into a caller-provided `ParsedFrame` (`parser.ts:9-14`) and returns the bytes consumed (or `null` when more data is needed). It throws `WebSocketProtocolError` on violations.

### Validation rules

- **RSV bits**: RSV1 allowed only when `allowRsv1` (permessage-deflate negotiated); RSV2/RSV3 always rejected (`parser.ts:42-44`).
- **Masking**: client frames must be masked (`parser.ts:50-52`).
- **Length**: 7-bit direct; `126` → 16-bit BE; `127` → `readBigUInt64BE` with a `> MAX_SAFE_INTEGER` guard → `MessageTooBig` (`parser.ts:64-80`).
- **Control frames**: RSV1/fin/payload > 125 all invalid (`parser.ts:82-86`).

### Zero-copy payload

`payload = buffer.subarray(offset + 4, offset + 4 + len)` (`parser.ts:96`) — a view into the receive buffer, not a copy. Unmasking happens **in place** (`parser.ts:98`).

`tryParseFrame` (`parser.ts:108-125`) is a one-shot convenience wrapper that allocates the out object (not for hot loops).

## Unmasking — two paths

`unmaskPayload` picks between two implementations by length (`parser.ts:133-237`), threshold `UNMASK_LOOP_THRESHOLD = 64` (`constants.ts:77`):

| Size | Path | Technique |
|------|------|-----------|
| `< 64` | `unmask8` | Fully unrolled 8-byte loop (mask bytes repeated) + byte remainder (`parser.ts:148-174`) |
| `>= 64` | `unmask32` | Three-pass `Uint32Array`: align start/end to 4-byte boundaries **relative to the ArrayBuffer** (not the view — handles subarray offsets), XOR prefix bytes, XOR aligned words with a **rotated mask word** (the mask byte is shifted into position per rotation, `parser.ts:195-202`), then suffix bytes. Falls back to `unmask8` if fewer than one aligned word exists (`parser.ts:190-193`) |

Below the threshold, the alignment setup of the word path costs more than the bytes it saves; above it, processing four bytes at a time wins (`constants.ts:72-76`).

## Building — `buildFrame` / `buildFrameHeader`

`frame/builder.ts:12-55`: encodes the header with 7-bit / 16-bit / 64-bit length selection. Server frames are **unmasked**.

## Connection integration

The connection's `handleChunk` appends to a buffer (zero-copy fast path when empty), loops `parseFrameInto`, and slices off consumed bytes with `subarray` (`connection.ts:290-318`). `emitMessage` fires `message`/`text`/`binary` — each guarded by `listenerCount` so a zero-listener fast path skips object allocation (`connection.ts:415-450`).
