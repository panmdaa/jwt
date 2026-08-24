# Testing

Tests run on **vitest** (`npm test` → `vitest run`). The config (`vitest.config.ts`) is empty defaults.

## Layout

```
test/
├── fixtures/
│   ├── key.pem / cert.pem      ← TLS and HTTP/2 tests read these
├── error/
│   └── error.test.ts
├── http/
│   ├── context/
│   │   ├── context.test.ts     ← ContextHandler getters, query/cookies parsing
│   │   └── response.test.ts    ← ResponseContext (status/headers/send/file/redirect)
│   ├── handler/
│   │   └── compile.test.ts     ← compileHandler ordering, next semantics, short-circuit
│   └── server/
│       ├── server.test.ts      ← HTTP/1, TLS, HTTP/2, 404/405/HEAD/OPTIONS, errors
│       └── websocket.test.ts   ← raw-socket TestClient: handshake + frames
└── router/
    └── router.test.ts          ← Router verbs, all/query/ws, group/router, RadixTree find
```

## Conventions

- Tests import from `src/...js` paths (ESM `"type": "module"`).
- `websocket.test.ts` implements a **minimal WebSocket client over raw `net`/`tls` sockets** — handshake, masking, frames — to exercise the server without depending on a WS client library (zero-dependency discipline applies to tests too).
- `router.test.ts` subclasses `Router` to expose the protected `find` (`router.test.ts:7-14`).
- `server.test.ts` reads the TLS fixtures from `test/fixtures/`.

## Running

```sh
npm test            # once
npm run test:watch  # watch mode
```

## Benchmarks as tests

The bench suite (`bench/`) is a separate package with its own vitest runs. See [Benchmarking](benchmarking.md).
