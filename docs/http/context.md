# Context

The context is the request surface your handlers receive. There are three classes, discriminated by what the handler can do:

| Class | File | Extra member |
|-------|------|--------------|
| `ContextHandler` | `src/http/context/context.ts` | base surface |
| `ContextHttpHandler` | `src/http/context/http-handler.ts` | `response`, `query`, `cookies`, `host`, `ip`, `origin` |
| `ContextBodyHandler` | `src/http/context/body-handler.ts` | + `body` |
| `ContextWSHandler` | `src/http/context/ws-handler.ts` | `socket` instead of `response` |

`Server.createContext` picks by method (`server.ts:84-114`): `POST, PUT, PATCH, DELETE, QUERY` → `ContextBodyHandler`; otherwise `ContextHttpHandler`.

## Base surface (`ContextHandler`)

| Member | Meaning |
|--------|---------|
| `method` | uppercase HTTP method |
| `url` | full request URL string |
| `headers` | Node request headers object |
| `params` | route params, typed via `Path<Url>` |
| `search` | the query string (`?a=b` → `a=b`), empty string if none |
| `request` | the underlying `IncomingMessage` |
| `state` | lazy shared object for passing data between middleware (`context.ts:49-52`) — only allocated if touched |
| `wildcard` | lazy `params["*"]` cache (`context.ts:54-59`) |

## HTTP surface (`ContextHttpHandler`)

All members are **lazily-cached getters** (`http-handler.ts:44`): the value is only computed on first access and cached afterwards.

| Member | How it's computed |
|--------|-------------------|
| `response` | `new ResponseContext(request, response)` — only allocated if you send something (`http-handler.ts:44-49`) |
| `query` | `parseQuery(new URLSearchParams(search))` (`http-handler.ts:58-66`) |
| `cookies` | `parseCookies(request.headers.cookie)` (`http-handler.ts:68-76`) |
| `host` | from the `host`/`x-forwarded-host` header via `requestHost` |
| `ip` | `request.socket.remoteAddress` |
| `origin` | protocol (from `socket.encrypted`) + host (`http/context/utils.ts:91-99`) |

## Body surface (`ContextBodyHandler`)

Adds `body` → `new BodyContext(request, content-type, maxBodySize)` (`body-handler.ts:29-38`), itself lazy. See [Body](body.md).

## WS surface (`ContextWSHandler`)

Extends the base with `socket: WebSocketConnection` — there is no `response` (the 101 already happened). See the WebSocket docs.

## Parsing details

- **`parseCookies`** (`utils.ts:10-55`): manual scan with native `indexOf`; `decodeURIComponent` is skipped unless the value actually contains `%` ("Optimized to use native indexOf and avoid decodeURIComponent unless necessary", `utils.ts:41-42`).
- **`parseQuery`** (`utils.ts:64-84`): single iteration over `URLSearchParams`, grouping duplicate keys into arrays — "Avoids creating a Set or using getAll()" (`utils.ts:69-71`).

## When each lazy member is paid

The golden rule: **you only pay for what you touch.** A handler that just does `response.send("hi")` allocates the `ResponseContext` (and its headers lazily inside `send`) and nothing else — no query parsing, no cookie parsing, no `state` object, no body representation.
