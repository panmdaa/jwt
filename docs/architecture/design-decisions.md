# Design Decisions

This document records the main architectural choices behind `@panmdaa/jwt`.

## 1. Zero runtime dependencies

**Problem**: authentication libraries sit on a security boundary. Every runtime
dependency expands the trusted code surface.

**Decision**: all JWT, JWS, encoding, validation, and error logic lives in this
repository. Cryptographic operations use Node's built-in `node:crypto` module.

**Why**: the full runtime path remains auditable in one package, avoids
supply-chain surprises, and keeps installation small.

## 2. Explicit algorithm allowlists

**Problem**: a JWT header is attacker-controlled input. Trusting its `alg`
field directly can allow algorithm confusion.

**Decision**: `verify()` requires `algorithms`, and the header algorithm must
match that caller-provided allowlist before signature verification runs.

**Why**: the verifier accepts only the algorithms the application expected for
that key and issuer.

## 3. `none` is forbidden

**Problem**: unsigned JWTs do not authenticate anything.

**Decision**: the library rejects `none` as a policy violation.

**Why**: accepting unsigned tokens would make "token exists" look too much like
"token is valid".

## 4. Algorithm implementations own key validation

**Problem**: each algorithm family has different key requirements. HMAC uses a
shared secret, RSA uses asymmetric keys, and ECDSA additionally depends on the
expected curve.

**Decision**: HMAC, RSA, and ECDSA implementations validate key type and curve
inside `src/algorithms/`.

**Why**: the crypto boundary stays close to the crypto operation, and all JWT
workflows get the same validation behavior.

## 5. Signing options override payload claims

**Problem**: callers may pass a payload that already contains standard claims
while also passing explicit signing options.

**Decision**: `sign()` merges option-driven claims last.

**Why**: security-sensitive claims such as `issuer`, `audience`, `subject`, and
`expiresIn` should be controlled by the call site, not by arbitrary payload
input.

## 6. `decode()` is intentionally untrusted

**Problem**: applications often need to inspect token metadata before choosing
a key, but decoded claims are not authenticated.

**Decision**: `decode()` only parses the header and payload. It does not verify
the signature or validate claims.

**Why**: the API is useful for logging and key selection while keeping trust
decisions attached to `verify()`.

## 7. Middleware stays framework-agnostic

**Problem**: JWT verification should not depend on Express, Fastify, Koa, or
any specific HTTP abstraction.

**Decision**: `jwtAuth()` accepts a small structural context: `headers`,
`cookies`, `state`, and `next()`.

**Why**: applications can adapt the middleware to their own framework while the
library remains focused on token extraction and verification.
