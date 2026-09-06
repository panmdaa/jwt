# Getting Started

## Install

```sh
npm install @panmdaa/jwt
```

Requires Node.js >= 18 and pure ESM imports.

## Sign a token

```ts
import { sign } from "@panmdaa/jwt";

const token = sign(
  { role: "admin" },
  process.env.JWT_SECRET!,
  {
    alg: "HS256",
    expiresIn: "15m",
    issuer: "panmdaa",
    audience: "admin-api",
    subject: "user-123",
  },
);
```

`sign()` accepts custom application claims plus standard JWT claims. Explicit
options such as `issuer`, `audience`, `subject`, `expiresIn`, and `notBefore`
take precedence over claims already present in the payload.

## Verify a token

```ts
import { verify } from "@panmdaa/jwt";

const payload = verify(token, process.env.JWT_SECRET!, {
  algorithms: ["HS256"],
  issuer: "panmdaa",
  audience: "admin-api",
  subject: "user-123",
});
```

Verification fails closed. The library checks token shape, the allowed
algorithm list, the cryptographic signature, time claims, and configured
issuer/audience/subject expectations before returning the payload.

## Decode for inspection

```ts
import { decode } from "@panmdaa/jwt";

const { header, payload } = decode(token);
```

`decode()` does not verify the signature. It is useful for logs and debugging,
but it must not be used for authorization decisions.
