# Architecture Overview

`@panmdaa/jwt` is a zero-dependency TypeScript library for signing, verifying,
and decoding JSON Web Tokens with Node's native `node:crypto` APIs.

## Module map

```text
src/
├── index.ts          <- root public barrel: sign, verify, decode, errors
├── types.ts          <- public JWT claim, header, signing, and verification types
├── algorithms/       <- HMAC, RSA, ECDSA, and the algorithm registry
├── encoding/         <- base64url and safe JSON serialization helpers
├── error/            <- JwtError, stable codes, and typed failures
├── jwt/              <- sign(), verify(), and decode() workflows
├── middleware/       <- framework-agnostic auth adapter
└── utils/            <- time, duration, and clock helpers
```

## Design philosophy

The library optimizes for three things:

1. Strict validation at the security boundary.
2. Zero runtime dependencies.
3. A small public API that is easy to audit.

JWT parsing is not treated as a convenience parser. The verifier rejects
malformed tokens, disallowed algorithms, bad signatures, expired tokens, and
claim mismatches before returning any trusted payload.

## Signing pipeline

1. Validate that the payload is a JSON object.
2. Build the protected header with `alg`, `typ`, and optional `kid`.
3. Merge standard claims from options into the payload.
4. Base64url-encode the header and payload.
5. Resolve the selected algorithm from the registry.
6. Sign `header.payload` and return `header.payload.signature`.

## Verification pipeline

1. Validate token type, length, and three-segment structure.
2. Decode header and payload as JSON objects.
3. Require a string `alg` header and check it against the allowlist.
4. Reject `none` by policy.
5. Verify the cryptographic signature.
6. Validate `exp`, `nbf`, `aud`, `iss`, and `sub` when configured.
7. Return the payload, or the complete verified token when requested.

## Public entry points

```ts
import { sign, verify, decode } from "@panmdaa/jwt";
import { jwtAuth } from "@panmdaa/jwt/middleware";
```

The root entry point contains JWT primitives, errors, and public types. The
middleware entry point is separate so applications can opt into the adapter
without expanding the root surface.
