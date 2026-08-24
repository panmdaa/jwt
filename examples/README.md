# Examples

Standalone, copy-paste examples for `@panmdaa/server`. Every file is
self-contained — drop it in your project (after `npm install @panmdaa/server`)
and run it.

## Run in this repo

From the repo root, each example resolves `@panmdaa/server` via the
package's own `exports` (self-reference). Requires Node 22.6+ for
`--experimental-strip-types`:

```sh
node --experimental-strip-types examples/basic/hello.ts
```

## `basic/` — first server, routing

| File | What it shows |
|------|---------------|
| `hello.ts` | Minimal server: `get`, params, `send`/`json` |
| `routing.ts` | Verbs, wildcards, optional segments, `group`, `router` |

## `http/` — HTTP features

| File | What it shows |
|------|---------------|
| `middleware.ts` | `cors`, `securityHeaders`, custom middleware, short-circuit |
| `body.ts` | Lazy body: `json`, `text`, `formData`, `raw` |
| `errors.ts` | `HttpError` subclasses, `onError` hook, `isHttpError` |
| `static.ts` | `file`/`download` with auto mime + Content-Length |

## `websocket/`

| File | What it shows |
|------|---------------|
| `chat.ts` | WS routes, heartbeat, broadcast, `verifyClient` |

## `http2/`

| File | What it shows |
|------|---------------|
| `tls.ts` | HTTP/2 (h2c) + TLS via ALPN, WS over extended CONNECT |

## `rest-api/`

| File | What it shows |
|------|---------------|
| `todos.ts` | Full CRUD REST API combining everything |

## Copy-paste into your own project

```sh
npm install @panmdaa/server
```

Then copy any example file and run it with `npx tsx <file>` (or compile with
`tsc`). Imports always come from the single entry point:

```ts
import { Server, Router, cors, securityHeaders, NotFound } from "@panmdaa/server";
```