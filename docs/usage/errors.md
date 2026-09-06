# Errors

JWT verification failures are represented by typed `JwtError` subclasses with
stable `code` values.

```ts
import { JwtError, verify } from "@panmdaa/jwt";

try {
  const payload = verify(token, key, { algorithms: ["HS256"] });
  return payload;
} catch (error) {
  if (error instanceof JwtError) {
    return { status: 401, code: error.code, message: error.message };
  }
  throw error;
}
```

Common error classes include `MalformedToken`, `InvalidSignature`,
`AlgorithmNotAllowed`, `TokenExpired`, `TokenNotYetValid`,
`AudienceMismatch`, `IssuerMismatch`, and `SubjectMismatch`.

Applications should avoid returning detailed verification reasons to untrusted
clients. The typed errors are most useful for logs, metrics, and internal
control flow.
