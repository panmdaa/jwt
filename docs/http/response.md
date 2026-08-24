# Response

`ResponseContext` (`src/http/context/response/response.ts`) is the response surface, lazily created only when the handler sends something.

## Commit model

- `headers` is a lazy getter (`response.ts:22-33`) — first write to `response.headers` allocates the map.
- `commit()` uses a **single** `writeHead(status, headers)` call (`response.ts:47-49`); the type assertion exists because the `ServerResponseLike` union's overloads are incompatible.

## `finish()` — how the body hits the wire

`finish()` (`response.ts:55-91`) has two paths:

**Fast path** — no custom headers AND status 200 → direct `native.end(chunk)` ("Node computes Content-Length and sends a single fixed-length response", `response.ts:58-68`).

**General path** — sets `Content-Length` explicitly when the size is known and not already set, so Node sends a **fixed-length** response instead of `Transfer-Encoding: chunked` ("faster to produce and to parse", `response.ts:70-82`).

## The surface

| Method | Behavior |
|--------|----------|
| `send(data)` | Auto content-type: `string` → `text/plain`, `Uint8Array` → `application/octet-stream`, else JSON (`response.ts:160-177`) |
| `json(data)` | `application/json`, throws if an explicit Content-Type was already set |
| `html(markup)` / `text(value)` | typed helpers, same guard |
| `status` | **mutable property**, default 200 — assign it (`response.status = 201`), not a method |
| `type(ct)` | sets Content-Type, appends `; charset=utf-8` (`response.ts:130-132`) |
| `vary(values)` | appends to `Vary`, deduped via a `Set` (`response.ts:134-152`) |
| `header(name, value?)` / `headers` | raw header access; `header(name)` gets, `header(name, value)` sets (`response.ts:111-119`) |
| `file(path)` / `download(path, name?)` | `sendFile`: `stat` → `Content-Length`, mime lookup, `Content-Disposition`, then `pipeline(createReadStream, native)` (`response.ts:225-248`) |
| `stream(readable)` | pipes with `pipeline` (`response.ts:98-103`) |
| `redirect(url, status = 302)` | sets `Location` + status (`response.ts:255-259`) |
| `end(chunk?)` | manual finish; the auto-response in `Server.run` calls this if the handler didn't |

## The status type

`Status` (`src/http/context/response/types.ts`) is an exhaustive numeric union of HTTP statuses (100–599, including 418, 450, 495-499, 521-530, 599). `HttpError` and the generated error classes are typed against it.

## Auto-response interplay

`Server.run` auto-ends the response if the handler didn't (`server.ts:116-145`). So a handler that only sets `response.status = 204` still completes the request — `writableEnded` is checked before the auto-end. Handlers that call `response.end()` themselves are simply skipped by the auto-finish.
