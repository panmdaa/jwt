# Router

The router answers two questions:

1. **HTTP**: given a method + URL, which compiled handler runs?
2. **WebSocket**: given a path, which WS handler runs?

It is split in two layers:

- `Router` (`src/router/router.ts`) — the registration API and the middleware composition.
- `RadixTree` (`src/router/radix-tree/`) — the matching engine.

## Registration API

```ts
const app = new Router();

app.use(logger());                      // applies to routes registered AFTER this line
app.get("/user/:id", ({ params }) => …);
app.all("/health", …);                  // registered under every HTTP method
app.query("/api/echo", async ({ body, response }) => …);  // body-capable "read"
app.ws("/live", ({ socket }) => …);     // path-only, separate tree
app.group("/api", (api) => { … });      // prefix + re-register children into parent
app.router("/admin", adminRouter);      // attach a child router
```

### Middleware composition

`use()` only appends to `middlewares` (`router.ts:28-31`). Composition happens lazily inside `addRoute`:

```ts
const composed = this.middlewares.length > 0
  ? compileHandler(...this.middlewares, handler)
  : handler;
```

So a `use()` call **after** a route is registered does not affect that route — middlewares are baked into the route's compiled chain at registration time (`router.ts:39-42`). This is why middleware ordering matters: register middleware *before* the routes it should wrap.

### `group` and `router`

`group(prefix, fn)` creates a child `Router(prefix)`, runs the callback, then re-registers every child route into the parent by iterating `child.routes`/`child.wsRoutes` (`router.ts:97-109`). Children do not keep their own tree. Handlers are already composed inside the child, so child middlewares are frozen in.

`router(path, child)` does the same with an existing router.

### Path typing

`Path<T>` (`src/router/types.ts`) is a template-literal type. `"/user/:id"` yields `{ id: string }`, `:name?` yields optional keys, and `*` yields `{ "*": string }`. This is what makes `ctx.params.id` type-safe. Segments are intersected via `Merge`.

## Matching engine: `RadixTree`

The public wrapper defers all `add()` calls and builds the tree on first lookup:

```
RadixTree.add() ──► deferred[]
RadixTree.find() ──► build() ──► InternalRadixTree.find() (swapped in, O(1) after)
```

### Tier 1 — static routes: O(1) flat map

Routes with no `:` or `*` go into `staticRoutes[method][path]` with a **prebuilt, immutable, shared** `FindResult` (`{ store, params: EMPTY_PARAMS, search: "" }`) (`internal-radix-tree.ts:240-245`). The raw URL is tried first (most requests have no query string, `:442-446`), then the query-stripped path (`:448-460`). `EMPTY_PARAMS` is frozen (`radix-tree/utils.ts:4`) and safe to share because nothing can ever be written into it.

### Tier 2 — dynamic routes: one compiled regex per method

Routes with params/wildcards are factored into a **trie** (so shared prefixes emit one regex fragment instead of duplicated alternatives — `buildMatcher`, `internal-radix-tree.ts:97-204`) and compiled into a single `RegExp`. Matching is then a single native `exec()`.

Before compiling, routes are checked pairwise with `hasRouteConflicts()` (`:43-81`). If any two are ambiguous (mutually-swallowing wildcards, shadowed static segments, identical shapes), the matcher returns `null` and lookup **falls back to trie traversal**, preserving registration precedence.

At match time the winner is found via the first empty marker group — `m.indexOf("", 1)` — an O(1) probe (`:462-464`). Params are then read out of the numbered capture groups; if a param is named `__proto__`, a null-proto params object is used so the write isn't swallowed (`:472-492`, `radix-tree/utils.ts:94-114`).

### Tier 3 — conflict-safe trie traversal

`matchRoute` (`radix-tree/utils.ts:116-236`) walks a radix trie character-by-character. Each node has:

- `part` — the common static prefix string (compared via unrolled charCode loop for strings < 15 chars, `:131-135`).
- `inert` — static children keyed by first charCode, so fanout is O(1) (`utils.ts:20-39`).
- `params` — the `:name` child.
- `wildcardStore` — the `*` leaf.

Params are threaded through a mutable `MatchState` so unwind frames can write values — explicitly avoiding module-level globals that would break under interleaved matches (`utils.ts:6-18`). A match can produce values for: static leaf → param leaf → wildcard leaf, in that priority order.

## How matching behaves

Order of checks in `find()` (`internal-radix-tree.ts:436-520`):

1. Static map hit → done.
2. Dynamic regex for that method → hit or miss.
3. Trie traversal (only when conflicts exist).
4. Miss → 404 (or 405 if `methods(url)` returns other methods).

## HTTP lifecycle hooks in the tree

- **HEAD fallback**: no HEAD route → `Server.request` tries `GET` and runs it (`server.ts:163-173`).
- **OPTIONS fallback**: no explicit OPTIONS route → `radixTree.methods(url)` builds the `Allow` header and auto-answers 200 (`server.ts:176-185`).
- **405**: other methods match the path → `Allow` header + 405 (`server.ts:187-196`).
- `methods(url)` (`internal-radix-tree.ts:530-537`) iterates `Object.keys(this.root)` — the source of truth populated for static routes too.

## WebSocket routes

`ws()` stores `{ handler: composed, path }` in the separate `wsTree` (`router.ts:48-60`), keyed by the pseudo-method `WS_METHOD = "WS"`. Matching is **path-only** — `findWebSocket` never looks at method — which is why `server.ws("/*", …)` can be a catch-all without colliding with HTTP routes.
