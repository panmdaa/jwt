# Configuration

`@panmdaa/jwt` keeps configuration explicit at the call site. Signing options
describe the token being created; verification options describe what the
consumer is willing to accept.

## Signing options

| Option | Meaning |
|--------|---------|
| `alg` | Required algorithm: `HS*`, `RS*`, or `ES*` |
| `kid` | Optional key id copied into the JWT header |
| `expiresIn` | Duration added to the current time for `exp` |
| `notBefore` | Duration added to the current time for `nbf` |
| `issuer` | Writes the `iss` claim |
| `audience` | Writes the `aud` claim |
| `subject` | Writes the `sub` claim |
| `jwtid` | Writes the `jti` claim |
| `addIssuedAt` | Set to `false` to omit automatic `iat` |

Durations can be numbers of seconds or strings such as `"15m"`, `"1h"`, or
`"7d"`.

## Verification options

| Option | Meaning |
|--------|---------|
| `algorithms` | Required allowlist of accepted algorithms |
| `issuer` | Expected `iss` value |
| `audience` | Expected `aud` value or values |
| `subject` | Expected `sub` value |
| `clockTolerance` | Seconds of leeway for `exp` and `nbf` |
| `maxTokenLength` | Maximum accepted JWT length, default 16 KiB |
| `complete` | Return `{ header, payload, signature }` instead of only payload |

Always pass the narrowest algorithm list that matches the key and issuer you
trust.
