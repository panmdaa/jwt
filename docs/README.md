# Documentation

This is the technical documentation for **`@panmdaa/server`**, a zero-dependency TypeScript HTTP/WebSocket server library.

Every document here explains **what** a subsystem does, **why** it was designed that way, **how** it works internally, and **when** each code path runs.

## Reading order

**Using the library** → start in [Usage](usage/README.md). **Understanding the library** → start with the architecture overview. Each document links to the relevant source files with `file:line` references.

| Topic | Document |
|-------|----------|
| **Using** the library, guides, best practices | [Usage](usage/README.md) |
| Big picture, module map, design philosophy | [Architecture overview](architecture/overview.md) |
| Why the code looks the way it does | [Design decisions](architecture/design-decisions.md) |
| Routing engine (RadixTree, params, wildcards) | [Router](router/how-it-works.md) |
| Route precedence and matching order | [Router matching & precedence](router/matching-precedence.md) |
| HTTP request lifecycle | [HTTP lifecycle](http/lifecycle.md) |
| Middleware compilation (`compileHandler`) | [Handler compilation](http/handler-compilation.md) |
| Handler contexts (request surface) | [Context](http/context.md) |
| Response surface | [Response](http/response.md) |
| Body parsing | [Body](http/body.md) |
| Error handling | [Errors](http/errors.md) |
| WebSocket handshake & upgrade | [WebSocket lifecycle](websocket/lifecycle.md) |
| Frame parsing & unmasking | [Frames](websocket/frames.md) |
| Connection state machine | [Connection](websocket/connection.md) |
| permessage-deflate compression | [Compression](websocket/compression.md) |
| Heartbeat | [Heartbeat](websocket/heartbeat.md) |
| HTTP/2 (streams & extended CONNECT) | [HTTP/2](http/http2.md) |
| Built-in middleware | [Middleware](middleware/built-in.md) |
| Testing | [Testing](development/testing.md) |
| Benchmarks | [Benchmarking](development/benchmarking.md) |
| npm scripts and tooling | [Development](development/tooling.md) |

## Conventions used in this documentation

- `file:line` references point at the current `src/` layout.
- "Fast path" means the code that runs for the common case (no query string, static route, small payload, no compression).
- Performance claims that come from measured benchmarks are tagged `[bench]` and cross-referenced in [Benchmarking](development/benchmarking.md).
