# Algorithms

The JWT domain is split into three algorithm families, each with a distinct key model and validation contract:

- `src/algorithms/hmac.ts` handles `HS256`, `HS384`, and `HS512`
- `src/algorithms/rsa.ts` handles `RS256`, `RS384`, and `RS512`
- `src/algorithms/ecdsa.ts` handles `ES256`, `ES384`, and `ES512`

They are unified behind a single registry in `src/algorithms/index.ts` so that callers can resolve an algorithm by string and execute the right signing or verification routine without branching in user code.

## Why the registry exists

The central registry does two things:

1. It normalizes the public algorithm name to a single implementation contract.
2. It enforces the "JWT algorithm allowlist" rule before any cryptographic operation runs.

The implementation contract is small: `sign(data, key)` and `verify(data, signature, key)`. This keeps the JWT layer independent from untrusted caller logic and keeps the actual crypto decisions in one place.

## Key-type and curve validation

The library validates the key before it signs or verifies because the same algorithm name can be safe only for a specific key type or curve. For example:

- `HS256` requires a shared secret, usually a string, `Buffer`, or `Uint8Array`
- `RS256` requires an RSA private key for signing and the matching public key for verification
- `ES256` requires an EC key and the expected named curve such as `P-256`

This validation is in the algorithm implementation layer rather than in the higher-level `sign()` and `verify()` functions. That keeps the crypto boundary explicit: callers may pass a raw key, but the algorithm implementation must accept only the exact kind of key that matches the selected JWA algorithm.

## ECDSA-specific validation

ECDSA is the clearest example of why the runtime metadata matters. A Node `KeyObject` for an EC key exposes the curve in `asymmetricKeyDetails.namedCurve`, not as a direct top-level property. If the library were to check the wrong field, it would accept the wrong key or reject a valid one. The implementation therefore validates the curve before producing a signature or verifying one, which prevents mismatches such as signing with `P-256` and verifying against `P-384` under the same algorithm name.

## Design consequence

This architecture deliberately fails fast. The library rejects an unsupported algorithm, a wrong key type, or a mismatched EC curve before attempting the crypto operation. This is not just ergonomic; it prevents subtle signature mismatches and makes the security rules predictable for every JWT path.