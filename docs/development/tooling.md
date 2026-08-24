# Development & tooling

## Commands

| Command | What it does |
|---------|--------------|
| `npm test` | vitest run |
| `npm run test:watch` | vitest watch |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | biome lint (auto-fix) |
| `npm run format` | biome format (auto-fix) |
| `npm run build` | `node scripts/run-all.mjs` (regenerate mime) + `tsup` (JS) + `tsc -p tsconfig.build.json` (declarations) |
| `npm run prepare` | same as build minus the generator |
| `npm run bench:*` | individual benches (see [Benchmarking](benchmarking.md)) |

## Code generation

`scripts/mime-types.mjs` regenerates `src/generated/mime.ts` from `mime-db`:

- Filters out `x-`/`vnd.` types.
- Prefers IANA > apache > nginx sources, then the shortest name (`mime-types.mjs:9-30`).
- Emits a `__proto__: null`-keyed `mimes` object plus a `lookup()` (`:49-75`).

Run it via `npm run build` (or `node scripts/run-all.mjs`).

## Build

- `tsup.config.ts`: entry `src/**/*.ts`, `esnext`, **ESM only**, `minify: true`, `bundle: true`, `treeshake: true`, `clean: true`. tsup preserves the `src/` directory structure in `dist/`.
- `tsconfig.build.json`: `emitDeclarationOnly`, `outDir: dist`, `rootDir: src` — tsup emits JS, tsc emits `.d.ts` with the same structure.

## Public entry point

`package.json` `exports` defines the public surface — a **single entry point** that re-exports every domain:

| Export | `dist/` target | Surface |
|--------|----------------|---------|
| `.` | `index.js` / `index.d.ts` | root barrel (`export *` from all sub-barrels) |
| `./package.json` | `package.json` | tooling convenience |

Adding a new public module means: (1) create its `src/<name>/index.ts` barrel, (2) `export *` it from `src/index.ts`.

> `src/index.ts` is a clean barrel — it must **never** contain executable code (no `new Server()`, no `listen()`), or importing the package would boot a server.

## Zero-dependency rule

`dependencies` is empty. `devDependencies` (tooling + bench-only libs) are fine. `src/` must never import a runtime dependency — if you reach for one, implement it in-repo instead.
