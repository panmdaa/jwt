# Matching & precedence

This document explains **when** each route wins, in what order, and the edge cases the router handles.

## Priority order within a path

For a given `method + path`, the engine resolves in this order:

1. **Static route** (`/user`) — exact literal match.
2. **Param route** (`/user/:id`) — the static segment must be matched first; the dynamic child is only tried after the static leaf fails.
3. **Wildcard** (`/static/*`) — deepest capture wins.
4. **Optional param** (`:name?`) — expanded into concrete routes at registration; an empty and a filled variant both exist, so no runtime branching.

In the compiled regex (tier 2), static children are ordered **before** param children so a literal match beats a capture at the same position (`internal-radix-tree.ts:150-157`).

## Registration precedence vs. ambiguity

Two different concerns:

- **Non-ambiguous routes** (the common case): matching is deterministic and fast (regex or trie). The route *shape* decides, not registration order.
- **Ambiguous routes** (mutually-swallowing wildcards, shadowed static segments, shape-identical params): `hasRouteConflicts()` detects them and **disables the regex tier**, falling back to trie traversal which preserves **registration precedence** — the first registered route of a matching shape wins (`internal-radix-tree.ts:38-42`).

So: if you have `/foo/:a` and `/foo/:b`, both shapes are identical, so they conflict and the trie fallback runs. If you have `/foo/:a` and `/foo/bar`, the static `bar` wins over the param because static comes first.

## Method fallbacks (HTTP)

When the path matches but the method doesn't:

| Situation | Result |
|-----------|--------|
| `HEAD` with no HEAD route | Falls back to `GET`; the GET handler answers with headers only (`server.ts:163-173`) |
| `OPTIONS` with no OPTIONS route | Auto-answers `200` with an `Allow` header built from `methods(url)` (`server.ts:176-185`) |
| Path exists for other methods | `405 Method Not Allowed` with `Allow` header (`server.ts:187-196`) |
| Path exists nowhere | `404 Not Found` (`server.ts:198-200`) |

The `Allow` header is derived from `methods(url)`, which iterates the root node keys populated during registration — including static routes (`internal-radix-tree.ts:530-537`).

## Wildcard semantics

- A route is a wildcard if the path ends in `*` (`internal-radix-tree.ts:247`). The `*` is sliced off and stored in `wildcardStore`.
- Matching is **prefix-based**: `/static/*` matches `/static/css/main.css`, and `params["*"]` gets `css/main.css`.
- Wildcards are a leaf — they can't have children routes underneath them.
- Two overlapping wildcards (`/a/*` and `/a/b/*`) are ambiguous → trie fallback → first registered wins.

## Optional params

- `/user/:id?` expands into `/user` and `/user/:id`.
- Mid-path: `/api/:v?/users` expands into `/api/users` and `/api/:v/users`.
- A tail of optionals expands combinatorially (`internal-radix-tree.ts:279-288`) — keep optional tails short.

## `__proto__` params

A route like `/data/:__proto__` writes into a null-proto params object so the assignment isn't swallowed by the prototype chain (`internal-radix-tree.ts:472-492`). Null-proto costs nothing on JSC but makes `for…in` ~12x slower on V8, so it's only used when such a param actually exists.

## Example

```ts
app.get("/user", h1);          // 1. static leaf
app.get("/user/:id", h2);      // 2. param leaf (same prefix node)
app.get("/user/:id/books", h3);
app.get("/user/me", h4);       // 3. static beats param at second segment
app.get("/static/*", h5);      // 4. wildcard leaf

GET /user        → h1
GET /user/me     → h4  (static `me` beats `:id`)
GET /user/42     → h2
GET /user/42/b   → 404 (no /user/:id/b route)
GET /static/a.js → h5, params["*"] = "a.js"
```
