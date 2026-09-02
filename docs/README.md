# Documentation

This is the technical documentation for **`@panmdaa/jwt`**, a zero-dependency TypeScript JWT library for Node.js.

Every document here explains **what** a subsystem does, **why** it was designed that way, **how** it works internally, and **when** each validation or cryptographic path runs.

## Reading order

**Using the library** → start in [Usage](usage/README.md). **Understanding the library** → begin with the architecture and security documents below.

| Topic | Document |
|-------|----------|
| **Using** the library, signing, verification, and payload handling | [Usage](usage/README.md) |
| JWT algorithm implementations and key validation | [Algorithms](architecture/algorithms.md) |
| Security rules and verification invariants | [Security](architecture/security.md) |
| Framework-agnostic middleware adapter | [Middleware](architecture/middleware.md) |
| Testing | [Testing](development/testing.md) |
| Benchmarks | [Benchmarking](development/benchmarking.md) |
| npm scripts and tooling | [Development](development/tooling.md) |

## Subsystem map

The package is intentionally small and layered:

- `src/algorithms/` — HMAC, RSA, and ECDSA implementations plus the central registry
- `src/encoding/` — base64url and JSON serialization helpers
- `src/error/` — typed JWT error classes and normalized codes
- `src/jwt/` — token signing, verification, and decoding
- `src/middleware/` — framework-agnostic auth adapter
- `src/utils/` — timestamps, duration parsing, and clock helpers

## Conventions used in this documentation

- `file:line` references point at the current `src/` layout.
- The library treats JWT parsing as a strict validation pipeline rather than a permissive convenience API.
- Performance claims that come from measured benchmarks are tagged `[bench]` and cross-referenced in [Benchmarking](development/benchmarking.md).
