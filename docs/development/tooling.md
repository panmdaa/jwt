# Development & tooling

## Commands

| Command | What it does |
|---------|--------------|
| `npm test` | runs the Vitest suite |
| `npm run test:watch` | runs Vitest in watch mode |
| `npm run typecheck` | runs `tsc --noEmit` for the project |
| `npm run lint` | runs Biome linting with auto-fix enabled |
| `npm run format` | runs Biome formatting with auto-fix enabled |
| `npm run build` | runs `tsup` and emits declaration files via `tsc -p tsconfig.build.json` |
| `npm run prepare` | alias for the package build pipeline |
| `npm run bench` | executes the internal benchmark package |

## Tooling overview

This project keeps tooling deliberately small and explicit:

- `tsup` bundles and emits the ESM package output.
- `tsc` is used for declaration generation and type checks.
- `vitest` runs the unit tests.
- `biome` handles linting and formatting.

## Build pipeline

- `tsup.config.ts` is the bundling entry point for the library.
- The package targets **ESM output** for Node 18+.
- `tsconfig.build.json` controls declaration emission, while `tsconfig.json` is used for editor/dev-time type checking.

The build is intentionally straightforward: the library ships a small set of runtime entry points and a narrow public surface, with no generated code outside the published output.

## Public entry point

`package.json` `exports` defines the public surface of the package:

| Export | `dist/` target | Surface |
|--------|----------------|---------|
| `.` | `index.js` / `index.d.ts` | root barrel for the public JWT API |
| `./middleware` | `middleware/index.js` / `middleware/index.d.ts` | framework-agnostic middleware adapter |

The root barrel is intentionally minimal: it re-exports the public API (`sign`, `verify`, `decode`, errors, and types) instead of carrying any runtime logic.

## Zero-dependency rule

The library stays free of runtime dependencies. All cryptographic operations are implemented via Node's built-in `crypto` module, and the project relies on tooling-only dev dependencies for build, testing, and formatting.

This is important for security and maintainability: the package's trust boundary remains the repository itself, and the runtime surface is limited to the Node platform APIs that are already present in the target environment.
