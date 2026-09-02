# Security considerations

JWT verification is intentionally strict. The library does not treat token parsing as a best-effort convenience API; it treats it as a security boundary where each check must fail closed.

## Explicit algorithm allowlist

`verify()` requires an explicit `algorithms` list in the verification options. That is the primary safeguard against algorithm confusion.

The check happens before signature validation:

1. Decode the header and payload.
2. Read the `alg` claim from the header.
3. Refuse the token if `alg` is missing, not a string, or not included in the configured allowlist.
4. Reject `"none"` even if it appears in the allowlist.

This matters because JWT is vulnerable to downgrade and confusion attacks when a verifier accepts whatever the token header says. By requiring an allowlist, the package forces the caller to decide which algorithm families are valid for the current key and trust model.

## Why `"none"` is always rejected

The `"none"` algorithm is deliberately forbidden even when a caller might think it is convenient for unsigned tokens. The library enforces this in the algorithm registry and again in the verifier itself.

Unsigned JWTs are not authenticated, so accepting them would collapse the distinction between "token exists" and "token is valid". The library therefore treats `"none"` as a hard policy violation, not as an optional mode.

## Constant-time comparisons

The library uses `node:crypto`'s constant-time primitives for cryptographic verification wherever appropriate, and it avoids string comparisons when a cryptographic equality check is required. This ensures a verifier does not leak information through timing differences that could help brute-force keys or check token validity in a side channel.

In practical terms, verification is structured so the cryptographic check is performed before the library exposes any richer claim-level validation. That ensures the library does not reveal whether a token is valid by timing the later claim checks.

## Token-size limits

`verify()` also enforces a maximum token length via `maxTokenLength` (defaulting to a conservative limit). This protects the application from oversized inputs, parser abuse, and unbounded memory consumption.

The check is applied before the library tries to parse the token into segments and before it decodes the base64url payload. If the string is too long, the token is rejected early with a `MalformedToken` error.

## Validation order

Verification follows a strict order:

1. Structural validation of the JWT format
2. Algorithm allowlist enforcement
3. Signature verification
4. Expiration and not-before checks
5. Audience, issuer, and subject claim checks

This order ensures the library validates the credential itself before it trusts any claim-based decisions. It also prevents one layer from masking another: a malformed token is rejected before any claim logic runs, and an invalid signature is rejected before time-based or scope-based checks are considered.