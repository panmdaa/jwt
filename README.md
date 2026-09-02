<img src="./misc/banner.svg" alt="Panmdaa JWT" />

<p align="center">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" />
  </a>
  <a href="https://npmjs.org/package/@panmdaa/jwt">
    <img src="https://badgen.now.sh/npm/v/@panmdaa/jwt" alt="version" />
  </a>
  <a href="https://npmjs.org/package/@panmdaa/jwt">
    <img src="https://badgen.now.sh/npm/dm/@panmdaa/jwt" alt="downloads" />
  </a>
  <a href="https://bundlephobia.com/result?p=@panmdaa/jwt">
    <img src="https://img.shields.io/bundlephobia/min/@panmdaa/jwt" alt="Bundle Size" />
  </a>
  <a href="https://bundlephobia.com/result?p=@panmdaa/jwt">
    <img src="https://img.shields.io/bundlephobia/minzip/@panmdaa/jwt" alt="Bundle Size (gzip)" />
  </a>
</p>


# @panmdaa/jwt

**Zero-dependency TypeScript library for signing and verifying JSON Web Tokens with native Node.js cryptography.**

`@panmdaa/jwt` implements the JWT and JWS building blocks described by RFC 7519, RFC 7515, and RFC 7518. It uses Node's built-in `node:crypto` module for HMAC, RSA, and ECDSA operations, with strict validation and no runtime dependencies.

```
npm install @panmdaa/jwt
```

## Quick look

```ts
import { sign, verify } from "@panmdaa/jwt";
import { jwtAuth } from "@panmdaa/jwt/middleware";

const token = sign(
  { userId: "user-123", role: "admin" },
  process.env.JWT_SECRET!,
  { alg: "HS256", expiresIn: "1h", issuer: "panmdaa" },
);

const payload = verify(token, process.env.JWT_SECRET!, {
  algorithms: ["HS256"],
  issuer: "panmdaa",
});

const authenticate = jwtAuth({
  key: process.env.JWT_SECRET!,
  algorithms: ["HS256"],
  issuer: "panmdaa",
});
```

> **Two entry points**: the JWT API is exported from `@panmdaa/jwt`, while the framework-agnostic adapter is exported from `@panmdaa/jwt/middleware`. See [Development](docs/development/tooling.md).

## Algorithms

The package supports symmetric HMAC, RSA, and elliptic-curve signatures. Each implementation validates that the supplied key matches the selected algorithm before operating.

| Family | Algorithms | Signing key | Verification key |
|--------|------------|-------------|------------------|
| HMAC | `HS256`, `HS384`, `HS512` | Shared secret (`string`, `Buffer`, or `Uint8Array`) | Same shared secret |
| RSA | `RS256`, `RS384`, `RS512` | RSA private key | RSA public key |
| ECDSA | `ES256`, `ES384`, `ES512` | EC private key on the expected curve | EC public key on the expected curve |

See the [algorithm design](docs/architecture/algorithms.md) for the registry, key validation, and curve checks.

## Claims

`sign()` accepts application claims together with standard JWT claims. Explicit signing options take precedence over claims with the same name.

| Claim | Type | Example | Meaning |
|-------|------|---------|---------|
| `iss` | `string` | `"panmdaa"` | Issuer of the token |
| `sub` | `string` | `"user-123"` | Subject identified by the token |
| `aud` | `string \| string[]` | `"admin-api"` | Intended audience |
| `exp` | `number` | `1760000000` | Expiration time in Unix seconds |
| `nbf` | `number` | `1759996400` | Time before which the token is invalid |
| `iat` | `number` | `1759992800` | Time at which the token was issued |
| `jti` | `string` | `"token-123"` | Unique token identifier |

Use `expiresIn` and `notBefore` for duration-based claims such as `"1h"` or `"15m"`. See [Usage](docs/usage/README.md) and the [security documentation](docs/architecture/security.md).

## Errors

JWT failures are represented by typed `JwtError` subclasses. Each error carries a stable `code`, an optional `description`, and the original `cause` when applicable.

| Error | `code` | When it is thrown |
|-------|--------|-------------------|
| `MalformedToken` | `ERR_MALFORMED_TOKEN` | The token is not a string, has the wrong number of segments, exceeds the size limit, or contains invalid JSON |
| `InvalidSignature` | `ERR_INVALID_SIGNATURE` | The signature does not match the supplied key |
| `AlgorithmNotAllowed` | `ERR_ALGORITHM_NOT_ALLOWED` | The header algorithm is missing, unsupported, or absent from the explicit allowlist |
| `AlgorithmNone` | `ERR_ALGORITHM_NONE` | The token requests the forbidden `none` algorithm |
| `InvalidKeyForAlgorithm` | `ERR_INVALID_KEY_FOR_ALGORITHM` | The key type or EC curve does not match the selected algorithm |
| `TokenExpired` | `ERR_TOKEN_EXPIRED` | The `exp` claim is in the past outside the configured tolerance |
| `TokenNotYetValid` | `ERR_TOKEN_NOT_YET_VALID` | The `nbf` claim is in the future outside the configured tolerance |
| `AudienceMismatch` | `ERR_AUDIENCE_MISMATCH` | The token audience does not match the configured audience |
| `IssuerMismatch` | `ERR_ISSUER_MISMATCH` | The token issuer does not match the configured issuer |
| `SubjectMismatch` | `ERR_SUBJECT_MISMATCH` | The token subject does not match the configured subject |

See the [security documentation](docs/architecture/security.md) for the validation order and security rationale.

## Middleware

The optional adapter is framework-agnostic. It extracts a bearer token from `Authorization` by default, or from a configured cookie, verifies it, stores the payload under `JWT_CONTEXT_STATE_KEY`, and calls the next handler.

```ts
import { jwtAuth, JWT_CONTEXT_STATE_KEY } from "@panmdaa/jwt/middleware";

const authenticate = jwtAuth({
  key: process.env.JWT_SECRET!,
  algorithms: ["HS256"],
  audience: "admin-api",
});

await authenticate(context, async () => {
  const payload = context.state[JWT_CONTEXT_STATE_KEY];
  return handleRequest(payload);
});
```

The adapter rethrows `JwtError` instances. The surrounding framework is responsible for mapping `ERR_INVALID_SIGNATURE`, `ERR_TOKEN_EXPIRED`, and other codes to its own HTTP or transport response. Read the [middleware design](docs/architecture/middleware.md) for the structural interfaces and extraction rules.

## API

> **Two entry points**: import signing, verification, decoding, errors, and public types from `@panmdaa/jwt`; import `jwtAuth` and middleware types from `@panmdaa/jwt/middleware`.

| Member | Description |
|--------|-------------|
| `sign(payload, key, options)` | Create a signed three-segment JWT |
| `verify(token, key, options)` | Verify the signature and configured claims |
| `decode(token)` | Decode header and payload without verifying; never use for authorization decisions |
| `Algorithm` | Supported HMAC, RSA, and ECDSA algorithm names |
| `JwtError` + subclasses | Typed failures with stable error codes |
| `jwtAuth(options)` | Framework-agnostic authentication middleware |
| `JWT_CONTEXT_STATE_KEY` | Symbol used to store the verified payload in context state |

## Internal architecture

```
src/
├── index.ts          <- root public barrel: sign, verify, decode, errors, types
├── types.ts          <- public JWT claim, header, signing, and verification types
├── algorithms/       <- HMAC, RSA, ECDSA, and central algorithm registry
├── encoding/         <- base64url and safe JSON serialization
├── error/            <- JwtError, error codes, and typed JWT failures
├── jwt/              <- sign(), verify(), and decode() workflows
├── middleware/       <- framework-agnostic auth adapter and contracts
├── utils/            <- time, duration, and clock validation helpers
└── generated/        <- generated package artifacts, when applicable
```

Built on Node's native `node:crypto` APIs, zero runtime dependencies, and pure ESM. Full internal documentation lives in [`docs/`](docs/README.md) — algorithms, security invariants, middleware behavior, testing, and tooling.

## Scripts

| `npm run` | Description |
|-----------|-------------|
| `build` | Bundle the ESM package with tsup and emit declarations with TypeScript |
| `prepare` | Run the package build pipeline before publishing or installing |
| `test` | Run the Vitest test suite |
| `test:watch` | Run Vitest in watch mode |
| `typecheck` | Run the TypeScript check without emitting files |
| `lint` | Run Biome linting with auto-fix |
| `format` | Run Biome formatting with auto-fix |
| `bench` | Run the internal HMAC, RSA, and ECDSA benchmarks |

---
<p align="center">
  Crafted with ❤️ by the Panmdaa project.
</p>
