# Handler compilation

Middleware and route handlers are compiled into a single function with `compileHandler` (`src/http/handler/compile.ts`).

## What it does

```ts
export function compileHandler<T = object>(...handlers: Handler<T>[]): CompiledHandler<T>
```

- `0` handlers → `(_ctx, next) => next?.()` (`compile.ts:8-10`).
- `1` handler → returned **as-is**, unwrapped (`compile.ts:12-14`) — a single synchronous handler stays synchronous, which matters for `Server.run`'s promise check.
- `>1` handlers → code generation: a source string is built and instantiated with `new Function(...params, source)(...handlers)` (`compile.ts:44-46`).

## The generated code

For `h0, h1, h2`:

```js
var nextCalled = false;
function advance(){nextCalled=true;}
var r0=h0(ctx,advance);if(r0!=null&&typeof r0.then==="function")await r0;
if(!nextCalled)return;nextCalled=false;
var r1=h1(ctx,advance);if(r1!=null&&typeof r1.then==="function")await r1;
if(!nextCalled)return;nextCalled=false;
var r2=h2(ctx,advance);if(r2!=null&&typeof r2.then==="function")await r2;
if(nextCalled)return next?.();
```

## Why it's fast

1. **Conditional await** — a handler is `await`ed only when it actually returned a thenable (`compile.ts:31-33`). Sync handlers pay **no microtask per request**. This is the single most important performance decision in the pipeline.
2. **Shared `next`** — `advance()` is one closure that flips a flag; no per-call function allocation.
3. **Short-circuit** — `if(!nextCalled)return;` before each handler: if any handler never called `next()`, the chain stops.
4. **Tail propagation** — after the last handler, `if(nextCalled)return next?.();` forwards to the outer `next`. For top-level routes that outer `next` is `NO_OP` (`http/server/constants.ts:1`).
5. **Minimal source** — `var`, declared function, minimal indentation (`compile.ts:16-17,43`) so the generated function stays small.

## The `next` contract

`Next = () => void` (`handler/types.ts`). Calling `next()` just flips `nextCalled`. NOT calling it is how a handler terminates the chain — this is what makes `cors()` preflight short-circuiting work (it sets status 204, ends the response, and never calls `next()`).

## ⚠️ Semantics vs Express

Because of the `await r{i}` before the next handler, a middleware that **returns a promise** *and* calls `next()` **serializes the chain**: the following handlers run only after that promise settles.

- This is a sequential pipeline, NOT Express semantics (Express does not await middleware).
- A sync middleware calling `next()` and returning `undefined` does **not** block — `typeof undefined.then !== "function"`, so no await.
- An async middleware (`async (ctx, next) => { await something(); next(); }`) WILL block until `something()` settles — by design.

## Where compiled handlers are used

- `Router.addRoute` composes `...middlewares, handler` once per route at registration (`router.ts:39-42`).
- `Router.addWebSocketRoute` does the same for WS chains (`router.ts:50-56`).
- The compiled handler is what `Server.run` invokes as `handler.store(context, NO_OP)`.

## Performance evidence

See [Benchmarking](../development/benchmarking.md) `bench/src/middleware.bench.ts` — compiled chains beat plain-array loops across 1/3/5/10-handler cases.
