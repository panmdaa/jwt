# Examples

Standalone, copy-paste examples for `@panmdaa/jwt`. Every file is
self-contained and can be run from the repository root with Node 22.6+:

```sh
node --experimental-strip-types examples/hmac.ts
```

When copied into your own project, install the package first:

```sh
npm install @panmdaa/jwt
```

## Files

| File | What it shows |
|------|---------------|
| `hmac.ts` | Sign and verify an HS256 token with issuer, audience, subject, and expiration checks |
| `decode.ts` | Decode token metadata for logging or debugging without trusting it |
| `rsa.ts` | Sign with an RSA private key and verify with the matching public key |
| `middleware.ts` | Use the framework-agnostic `jwtAuth` adapter with a minimal context object |

All signing, verification, decoding, errors, and public types come from
`@panmdaa/jwt`. The middleware adapter comes from `@panmdaa/jwt/middleware`.
