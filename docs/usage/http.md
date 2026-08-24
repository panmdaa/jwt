# HTTP

Everything about routing, the request context, the body and the response.

## Routes

### Verbs

```ts
server.get("/items", …);
server.post("/items", …);
server.put("/items/:id", …);
server.delete("/items/:id", …);
server.patch("/items/:id", …);
server.options("/items", …);
server.head("/items", …);
server.all("/items", …);     // same handler under every HTTP method
server.query("/search", …);  // body-capable "read" route (no HTTP method)
```

### Parameters

```ts
server.get("/user/:id", ({ params }) => {
  console.log(params.id); // typed: string
});
```

- `:name` — required segment.
- `:name?` — optional segment, `params.name?: string | undefined`.
- `*` — wildcard suffix, `params["*"]` holds everything after the prefix:

```ts
server.get("/static/*", ({ params }) => {
  console.log(params["*"]); // "css/main.css" for /static/css/main.css
});
```

Param typing is compile-time (via the `Path` type) — `/user/:id` gives you `params.id: string` and a wrong property is a type error.

### Groups

Prefix a set of routes with `group` or attach an existing router:

```ts
server.group("/api", (api) => {
  api.get("/users", …);   // /api/users
  api.ws("/live", …);     // /api/live
});

const admin = new Router();
admin.get("/stats", …);
server.router("/admin", admin); // /admin/stats
```

Handlers are re-registered into the parent tree; child middlewares are frozen in. See [Router](../router/how-it-works.md).

## Context

The context is your request surface. What's available depends on the route type:

| Member | Available | Notes |
|--------|-----------|-------|
| `method`, `url`, `headers` | always | |
| `params` | always | typed by route path |
| `search` | always | query string without `?` |
| `request` | always | the underlying `IncomingMessage` |
| `state` | always | shared mutable object between middleware — lazy |
| `wildcard` | always | cached `params["*"]` |
| `query` | HTTP routes | parsed query object; duplicates become arrays |
| `cookies` | HTTP routes | parsed cookies |
| `host`, `ip`, `origin` | HTTP routes | lazy |
| `response` | HTTP routes | lazy — only allocated if you write |
| `body` | `POST/PUT/PATCH/DELETE/QUERY` | lazy — see below |
| `socket` | WS routes | replaces `response` |

Everything is **lazily computed and cached** — you only pay for what you touch. See [Context](../http/context.md).

## Query string

```ts
server.get("/search", ({ query, response }) => {
  response.json({
    q: query.q,
    tags: query.tags,   // string[] when repeated (?tags=a&tags=b)
  });
});
```

`query` is parsed from `search` via `URLSearchParams`; repeated keys become arrays.

## Cookies

```ts
server.get("/", ({ cookies, response }) => {
  const session = cookies.session;
  // set one:
  response.header("set-cookie", "session=abc; HttpOnly; Path=/");
});
```

`parseCookies` avoids `decodeURIComponent` unless a value contains `%`.

## Body

Body-capable routes: `POST`, `PUT`, `PATCH`, `DELETE`, `QUERY`.

`ctx.body` is lazy and per-representation cached — read once, or read `text()` then `json()` and only pay one Buffer→string conversion.

```ts
server.post("/api/echo", async ({ body, response }) => {
  const raw = await body.raw();           // Uint8Array
  const text = await body.text();         // string
  const json = await body.json();         // parsed (reuses text if decoded)
  const buf = await body.arrayBuffer();   // ArrayBuffer
  const form = await body.formData();     // FormData (urlencoded + multipart)
  const stream = await body.stream();     // web ReadableStream
  response.json({ received: json });
});
```

- Empty text → `json()` returns `{}`.
- `body.raw()` short-circuits `GET/HEAD/OPTIONS/TRACE` to an empty buffer — those never have a body.
- Exceeding `maxBodySize` throws `PayloadTooLarge` (413) **while streaming**, not after the whole body arrives.

## Response

```ts
server.get("/hi", ({ response }) => {
  response.type("text/html");        // appends ; charset=utf-8
  response.send("<h1>Hi</h1>");
});

server.get("/data", ({ response }) => {
  response.status = 201;
  response.header("x-request-id", "abc");
  response.json({ created: true });
});

server.get("/file", ({ response }) => {
  response.file("./assets/logo.png");
});

server.get("/old", ({ response }) => {
  response.redirect("/new", 301);
});
```

| Method | Notes |
|--------|-------|
| `send(data)` | auto content-type: string → text/plain, Uint8Array → octet-stream, else JSON |
| `json` / `html` / `text` | typed helpers; throw if an explicit Content-Type was already set |
| `status` | **mutable property** (default 200) — assign it, don't chain |
| `type(ct)` / `header(name, value?)` / `headers` | header control; `header(name)` gets, `header(name, value)` sets |
| `vary(values)` | deduped `Vary` |
| `file(path)` / `download(path, name?)` | streams with `Content-Length` + `Content-Disposition` |
| `stream(readable)` | pipes with `pipeline` |
| `redirect(url, status = 302)` | `Location` + status |
| `end(chunk?)` | manual finish |

**Auto-finish**: if your handler doesn't write, `Server.run` ends the response for you. So `response.status = 204` alone completes the request. Handlers that call `response.end()` themselves are not double-ended.

**Content-Length**: when the size is known, the server sends fixed-length (never `chunked`) — faster to produce and parse. See [Response](../http/response.md).

## Errors

```ts
import { NotFound, BadRequest } from "@panmdaa/server";

server.get("/nope", () => {
  throw new NotFound();
});

server.post("/login", ({ body, response }) => {
  throw new BadRequest("Invalid credentials");
});
```

- `HttpError(status, message?, description?, cause?)` — the base class.
- ~60 named subclasses via `createHttpErrorClass`: `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `MethodNotAllowed(method)`, `PayloadTooLarge(maxBodySize)`, `UnsupportedMediaType(ct)`, `ImATeapot`, etc.
- Unknown errors → 500 `Internal Server Error`.
- `onError` hook runs first and sees the real error (even the 500s the client doesn't get).

See [Errors](../http/errors.md).

## Auto behavior (HEAD / OPTIONS / 405)

- **HEAD** without a HEAD route → runs `GET`, sends headers only (`server.ts:163-173`).
- **OPTIONS** without a route → auto `200` + `Allow` header from the registered methods (`server.ts:176-185`).
- **Wrong method** → `405` + `Allow` header.
- **No route** → `404`.

All are JSON `{ status, message }` with `application/json; charset=utf-8`.

> Note: `cors()` handles OPTIONS preflights before this fallback — if you use it, preflights get the `204` CORS response instead. See [Middleware](middleware.md).
