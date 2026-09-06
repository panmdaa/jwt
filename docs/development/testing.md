# Testing

Tests run with Vitest:

```sh
npm test
```

## Layout

```text
test/
├── algorithms/     <- HMAC, RSA, ECDSA, and registry behavior
├── encoding/       <- base64url and JSON-safe serialization
├── error/          <- JwtError classes and stable codes
├── fixtures/       <- key and certificate fixtures used by crypto tests
├── jwt/            <- sign(), verify(), and decode()
├── middleware/     <- jwtAuth extraction, verification, and state behavior
└── utils/          <- duration, time, and clock helpers
```

## Conventions

- Tests import implementation modules from `src/` for focused coverage.
- Public API behavior should also be covered through `src/index.ts` where it
  affects package consumers.
- Error tests should assert stable `code` values, not only class names.
- Crypto tests should cover both accepted and rejected key/algorithm
  combinations.

## Useful commands

```sh
npm test
npm run test:watch
npm run typecheck
```

Run the benchmark suite when changes touch signing, verification, encoding, or
algorithm implementations.
