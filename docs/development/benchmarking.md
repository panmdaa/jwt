# Benchmarking

Benchmarks live in `bench/`, its own package named `@panmdaa/jwt-bench`.

## How to run

```sh
npm run bench
```

The root script delegates to the bench package:

```sh
npm --prefix bench run bench
```

## What is measured

| File | Focus |
|------|-------|
| `bench/src/hmac.bench.ts` | HMAC signing and verification |
| `bench/src/rsa.bench.ts` | RSA signing and verification |
| `bench/src/ecdsa.bench.ts` | ECDSA signing and verification |

Each benchmark signs representative JWT payloads and verifies the resulting
tokens with the matching algorithm allowlist.

## Interpreting results

Benchmark numbers are machine-relative. When sharing performance claims, note
the Node.js version, CPU, operating system, and command used to produce the
result.
