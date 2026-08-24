# Contributing to @panmdaa/server

Thank you for considering contributing to `@panmdaa/server`.

`@panmdaa/server` is a zero-dependency TypeScript HTTP server over Node's native transport: compiled radix-tree routing, code-generated middleware pipelines, WebSockets with permessage-deflate, and HTTP/2 (h2c, ALPN, extended CONNECT). It ships as pure ESM and is tree-shakeable. Contributions that improve correctness, performance, documentation, tests, and API clarity are welcome.

## Repository Layout

- `src/` — source, organized in modular subpackages (`http`, `router`, `ws`, `middleware`, `error`), each re-exported from its own `index.ts` barrel.
- `test/` — vitest test suite (HTTP, router, WebSocket, context, errors).
- `bench/` — benchmarks against other Node HTTP/WebSocket libraries.
- `docs/` — architecture, usage, and subsystem documentation.
- `.github/workflows/` — CI and release automation.

The package exposes a single entry point — `@panmdaa/server` — which re-exports everything (`error`, `http`, `middleware`, `router`, `ws`).

## Ways To Contribute

- reporting bugs or regressions in library behavior
- improving documentation, README, or examples
- adding tests for edge cases and public API behavior
- optimizing hot paths or reducing GC pressure
- proposing API improvements aligned with the project's design goals

## Before You Start

For small fixes, open a pull request directly.

For larger changes, open an issue first so we can align on scope, API design, and compatibility impact.

Changes that should usually be discussed first:

- new public exports
- changes to core internal algorithms or data structures
- changes to public function signatures or return types
- adding runtime dependencies
- breaking changes to public API or output

## Local Setup

```bash
npm install
```

Useful commands during development:

```bash
npm run typecheck
npm test
npm run lint
npm run format
npm run build
```

If you touch performance-sensitive code, run the benchmark suite to check for regressions. Individual suites are available too:

```bash
npm run bench              # everything
npm run bench:router
npm run bench:http
npm run bench:http:post
npm run bench:middleware
npm run bench:parse
npm run bench:ws
```

## Contribution Guidelines

- Use English for code, comments, issues, and pull requests.
- Keep the public API minimal and predictable.
- Zero dependencies is a hard constraint.
- Avoid breaking changes unless clearly justified and documented.
- Add or update tests when changing behavior or public API.
- Update documentation when public behavior or output changes.
- Preserve existing naming conventions and import patterns.

## Code Style

- Use strict TypeScript with explicit return types on public API functions.
- Prefer readable, explicit code over clever abstractions.
- Keep modules focused: each file should have a single clear responsibility.
- Preserve the existing file structure under `src/`.
- Performance-sensitive paths should avoid unnecessary allocation.
- Formatting and linting are enforced by [Biome](https://biomejs.dev/); run `npm run lint` and `npm run format` before pushing.
- Use tabs for indentation and double quotes for strings (repo convention).

## Pull Request Checklist

Before opening a PR, make sure:

- `npm run typecheck` passes
- `npm test` passes
- new behavior is covered by tests
- docs are updated when public API or behavior changes
- breaking changes or migration notes are called out clearly
- if performance-sensitive, benchmark results are included

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/). Scope the change when it touches a subsystem:

```
feat: add HTTP/2 extended CONNECT to ws routes
fix(router): resolve wildcard precedence for static segments
perf(ws): reduce allocations in frame parser hot path
docs(http): document body streaming limits
```

## Review Expectations

Reviews focus on:

- correctness of behavior and edge cases
- API clarity and consistency
- backward compatibility
- documentation quality
- test coverage
- maintainability
- performance in hot paths

Feedback is meant to improve the project. Questions, iterations, and design discussion are welcome.

## Need Help?

If you are unsure whether an idea fits `@panmdaa/server`, open an issue and describe:

- the use case
- the proposed API or behavior
- alternatives you considered
- compatibility or performance concerns
