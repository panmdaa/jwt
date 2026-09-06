# Token Lifecycle

JWTs are compact credentials. `@panmdaa/jwt` treats each token as a strict
validation pipeline rather than a best-effort parser.

## Standard claims

| Claim | Option | Purpose |
|-------|--------|---------|
| `iss` | `issuer` | Identifies who issued the token |
| `sub` | `subject` | Identifies the token subject |
| `aud` | `audience` | Identifies intended recipients |
| `exp` | `expiresIn` | Rejects tokens after a point in time |
| `nbf` | `notBefore` | Rejects tokens before a point in time |
| `iat` | automatic unless disabled | Records when the token was issued |
| `jti` | `jwtid` | Provides a unique token id |

## Complete verification

```ts
const result = verify(token, key, {
  algorithms: ["HS256"],
  issuer: "panmdaa",
  audience: ["admin-api", "internal-api"],
  complete: true,
});

console.log(result.header.kid);
console.log(result.payload.sub);
```

Use `complete: true` when the application needs verified header metadata such
as `kid`. If you only need claims, omit it and `verify()` returns the payload
directly.
