# Best Practices

## Keep algorithm policy explicit

Always pass `algorithms` to `verify()` and keep the list as narrow as possible.
Do not accept a token just because its header names an algorithm.

```ts
verify(token, publicKey, { algorithms: ["RS256"] });
```

## Validate issuer and audience

Signature verification proves that a trusted key signed the token. Issuer and
audience checks prove that this specific service should accept it.

```ts
verify(token, key, {
  algorithms: ["HS256"],
  issuer: "panmdaa",
  audience: "billing-api",
});
```

## Treat `decode()` as inspection only

`decode()` is useful for diagnostics, selecting a key id before verification,
or showing metadata in logs. It does not authenticate the token.

## Use short-lived tokens

Prefer short `expiresIn` values and rotate signing keys deliberately. For
distributed systems, use `clockTolerance` only for small clock drift, not as a
large grace period.

## Keep secrets out of source

Load HMAC secrets and private keys from environment-specific secret storage.
Public verification keys can be distributed more broadly, but they still need
rotation and ownership.
