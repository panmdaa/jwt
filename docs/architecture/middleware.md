# Middleware adapter

The middleware adapter in `src/middleware/index.ts` is intentionally framework-agnostic. It does not import a HTTP server framework or assume Express, Fastify, Koa, or any other runtime-specific request type. Instead, it relies on a minimal structural contract: a context object with `headers`, `cookies`, and `state`, plus a `next()` function.

## Token extraction

The adapter resolves a token from a configured source before it attempts verification. By default, it reads the `Authorization` header expecting a `Bearer ` prefix, but it can also read from a cookie when `tokenSource: "cookie"` is used.

The extraction logic is intentionally narrow:

- `Authorization` header is read from `context.headers` when available
- `Cookie` values are read from `context.cookies` when available
- If the configured source is missing, the middleware throws a `MalformedToken` error

This keeps the adapter usable across framework boundaries without forcing the app to adapt around a single library-specific request object.

## Where the payload goes

Once the token is verified, the payload is attached to the request state under a symbol key:

- `JWT_CONTEXT_STATE_KEY`

The adapter builds a new state object by merging the existing `context.state` and storing the payload under that symbol. This makes the token data available to downstream middleware or handlers without mutating the original request object in a framework-specific way.

## Why the interfaces are minimal

The request-side interfaces are intentionally structural and tiny. The middleware only expects the pieces it actually needs:

- headers or cookies for locating the token
- a mutable `state` object for storing the verified payload
- a `next()` function to continue the pipeline

This keeps the adapter decoupled from any concrete server implementation and makes it straightforward to wrap it in other frameworks or custom HTTP layers. It also mirrors the design of the library itself: a narrow contract, then explicit validation.

## Error mapping expectations

The middleware is designed to rethrow library errors from the JWT verification flow. If a token is missing, malformed, expired, invalid, or rejected by algorithm policy, the adapter lets those errors bubble to the surrounding framework.

That means the caller is expected to map those errors into HTTP responses, structured JSON, or framework-specific auth failures in the outer layer. The middleware itself only performs extraction and verification; it does not manufacture HTTP responses.

This keeps the adapter reusable and testable and lets each application decide how to surface authentication failures without coupling the JWT core to a specific transport or framework.