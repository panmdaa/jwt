# Errors

Error handling is centralized in `src/error/` and mapped to responses in `Server.handleError`.

## `HttpError` and friends

- `HttpError` (`http-error.ts:67-77`): `new HttpError(status, message?, description?, cause?)`. `message` defaults to `STATUS_MESSAGES[status]`; `this.name = this.constructor.name` so subclass names survive serialization.
- `isHttpError(value)` type guard (`http-error.ts:80-82`).
- `STATUS_MESSAGES` (`http-error.ts:4-60`): every status phrase, the source of default messages.

## Generated subclasses

`createHttpErrorClass(status, className, defaultMessage)` (`http-error.ts:94-112`) generates ~60 named classes in `errors.ts` (`BadRequest`, `NotFound`, `ImATeapot`, `NetworkConnectTimeoutError`, …), each with a static `status`.

Three classes take constructor args because their message needs data:

- `MethodNotAllowed(method)` (`errors.ts:21-25`)
- `PayloadTooLarge(maxBodySize)` (`errors.ts:55-59`)
- `UnsupportedMediaType(contentType?)` (`errors.ts:67-76`)

## Throwing and mapping

```ts
throw new NotFound();                    // → 404 { status: 404, message: "Not Found" }
throw new MethodNotAllowed("PATCH");     // → 405 with the method in the message
throw new Error("boom");                 // → 500 { status: 500, message: "Internal Server Error" }
```

`Server.handleError` (`server.ts:203-235`):

1. Runs the `onError` hook first (in a try/catch — a throwing hook can't kill the process, `server.ts:206-209`).
2. Bails if the response is already committed.
3. `HttpError` → its `status`/`message`/`description` as JSON.
4. Anything else → `500` with the generic message (the real error goes to `onError`, not to the client).

## WebSocket errors

- `WebSocketProtocolError` (`ws/protocol-error.ts:7-15`) carries a `closeCode` (default `ProtocolError`) used by `WebSocketConnection.fail()` to send a Close frame before destroying.
- In the upgrade path, `WebSocketUpgrader.handleWebSocketError` calls the `onError` hook then destroys the socket (`http/server/websocket.ts:142`) — a failed upgrade gets a raw rejection, not a 500 JSON.

## `onError` hook

`ServerOptions.onError?: (error, ctx) => …` (`server/types.ts`). Runs for both HTTP and WebSocket errors, always before the response is produced.
