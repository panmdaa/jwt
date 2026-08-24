# Body

`BodyContext` (`src/http/context/body/body.ts`) exposes the request payload in multiple representations, each **cached lazily** — you pay for the one you read, and once.

Only `ContextBodyHandler` has `body` (`POST, PUT, PATCH, DELETE, QUERY`). A `GET` handler gets `ContextHttpHandler` and no `body` surface.

## Representations

| Method | Returns | Notes |
|--------|---------|-------|
| `raw()` | `Uint8Array` | Short-circuits `GET/HEAD/OPTIONS/TRACE` to an empty buffer — `NO_BODY_METHODS` (`body.ts:7`): "Reading them would hang waiting for a stream that can never arrive" (`body.ts:23-35`) |
| `json()` | parsed object | **Reuses `cachedText`** if text was already decoded — "avoiding a second Buffer→string conversion" (`body.ts:37-51`); empty text → `{}` |
| `text()` | `string` | |
| `arrayBuffer()` | `ArrayBuffer` | slices the exact byte range from the underlying buffer (`body.ts:61-70`) |
| `formData()` | `FormData` | |
| `stream()` | web `ReadableStream` | `Readable.toWeb` wrapper over the raw buffer (`body.ts:80-88`) |

Each representation caches into its own slot (`cachedRaw`, `cachedJson`, `cachedText`, …), so calling `text()` then `json()` parses the buffer only once.

## How the raw body is read

`readRawBody` (`src/http/context/body/utils.ts:13-61`):

1. Accumulates chunks, tracking total length so `Buffer.concat(chunks, size)` allocates **exactly once** (`utils.ts:21-23,49`).
2. Reuses one `onData` closure ("avoid recreating closures per chunk", `utils.ts:31-32`).
3. Rejects with `PayloadTooLarge` as soon as `size > maxBodySize` (`utils.ts:37-40`) — a huge body is rejected **while streaming**, not after.
4. Cleanup uses optional chaining so mock request-likes implementing only `on` still work (`utils.ts:23-29`).

## Form parsing

`parseFormData`/`parseMultipart` (`utils.ts:72-261`):

- `application/x-www-form-urlencoded` → `URLSearchParams`.
- `multipart/form-data` → **manual byte scanning** with precomputed delimiter buffers (`dashBoundary`, `crlfDashBoundary`, `doubleCRLF`, `utils.ts:147-150`) — no regex, no per-part allocations.
- Falls back to `Blob` when `File` is unavailable (Node compat, `utils.ts:244-250`).
- Errors are `TypeError`s (missing content-type / boundary / unsupported type).

## `maxBodySize`

Default 16 MiB (`DEFAULT_MAX_PAYLOAD`), set via `ServerOptions.maxBodySize` (`server/types.ts`). Overflow → `PayloadTooLarge` → 413 JSON response.
