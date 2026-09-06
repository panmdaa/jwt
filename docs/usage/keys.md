# Key Management

`@panmdaa/jwt` supports HMAC, RSA, and ECDSA algorithms through Node's native
`node:crypto` primitives.

## HMAC

Use HMAC for shared-secret deployments where the signer and verifier are the
same service or trust boundary.

```ts
const token = sign(payload, secret, { alg: "HS256" });
verify(token, secret, { algorithms: ["HS256"] });
```

Use a long random secret from configuration or a secret manager.

## RSA

Use RSA when a private signer must distribute public verification keys.

```ts
const token = sign(payload, privateKey, { alg: "RS256", kid: "2026-09" });
verify(token, publicKey, { algorithms: ["RS256"] });
```

The library validates that the supplied key type matches the selected
algorithm before signing or verifying.

## ECDSA

ECDSA keys must use the curve expected by the selected algorithm: P-256 for
`ES256`, P-384 for `ES384`, and P-521 for `ES512`.

```ts
const token = sign(payload, ecPrivateKey, { alg: "ES256" });
verify(token, ecPublicKey, { algorithms: ["ES256"] });
```

Never include `"none"` in an allowlist. Unsigned JWTs are rejected by policy.
