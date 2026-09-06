# Usage

This is the how-to guide for `@panmdaa/jwt`: signing tokens, verifying them,
inspecting metadata, handling errors, and wiring the framework-agnostic
middleware into an application.

## Reading order

| Guide | What you'll learn |
|-------|-------------------|
| [Getting started](getting-started.md) | Install, sign, verify, and decode a token |
| [Token lifecycle](claims.md) | Claims, expiration, issuer, audience, and subject checks |
| [Middleware](middleware.md) | Use `jwtAuth` with any context-shaped framework |
| [Configuration](configuration.md) | Signing and verification options |
| [Errors](errors.md) | Typed JWT failures and how to map them in an app |
| [Key management](keys.md) | HMAC secrets, RSA keys, ECDSA keys, and algorithm allowlists |
| [Best practices](best-practices.md) | Practical security guidance for production use |

For internal design details, see the [architecture](../architecture/overview.md)
docs.

## Key concepts

```ts
import { sign, verify } from "@panmdaa/jwt";

const token = sign(
  { role: "admin" },
  process.env.JWT_SECRET!,
  { alg: "HS256", expiresIn: "15m", issuer: "panmdaa" },
);

const payload = verify(token, process.env.JWT_SECRET!, {
  algorithms: ["HS256"],
  issuer: "panmdaa",
});
```

- `sign(payload, key, options)` creates a signed three-segment JWT.
- `verify(token, key, options)` validates structure, algorithm policy,
  signature, time claims, and configured claim expectations.
- `decode(token)` parses header and payload without verifying the signature;
  use it only for inspection.
- `jwtAuth(options)` builds framework-agnostic middleware that stores the
  verified payload in `context.state`.

The root entry point is `@panmdaa/jwt`. Middleware lives in
`@panmdaa/jwt/middleware`.
