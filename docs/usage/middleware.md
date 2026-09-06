# Middleware

`@panmdaa/jwt/middleware` exports a small, framework-agnostic authentication
adapter. It expects a context with optional `headers`, optional `cookies`, and a
mutable `state` object.

```ts
import { jwtAuth, JWT_CONTEXT_STATE_KEY } from "@panmdaa/jwt/middleware";

const authenticate = jwtAuth({
  key: process.env.JWT_SECRET!,
  algorithms: ["HS256"],
  issuer: "panmdaa",
  audience: "admin-api",
});

await authenticate(context, async () => {
  const payload = context.state[JWT_CONTEXT_STATE_KEY];
  return handleRequest(payload);
});
```

## Token sources

By default, the middleware reads the `Authorization` header and removes the
`Bearer ` prefix.

```ts
jwtAuth({
  key,
  algorithms: ["HS256"],
  headerName: "Authorization",
  headerPrefix: "Bearer ",
});
```

Cookie-based extraction is also supported:

```ts
jwtAuth({
  key,
  algorithms: ["HS256"],
  tokenSource: "cookie",
  cookieName: "access_token",
});
```

## State key

Verified payloads are stored under `JWT_CONTEXT_STATE_KEY` by default. Pass a
custom symbol when an application already has its own state convention.

```ts
const userToken = Symbol("userToken");

jwtAuth({
  key,
  algorithms: ["HS256"],
  stateKey: userToken,
});
```

The middleware rethrows `JwtError` instances from verification. Your framework
or HTTP layer should map those errors to the response shape you want.
