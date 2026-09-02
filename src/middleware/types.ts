/**
 * Minimal request context shape for framework-agnostic JWT middleware.
 *
 * Any framework that exposes a read-only header map and a mutable per-request
 * state object is structurally compatible with this contract.
 */
export interface JwtContext<State extends Record<string, unknown> = Record<string, unknown>> {
	/** Read-only access to headers. */
	headers?: {
		get(name: string): string | undefined;
		[name: string]: unknown;
	};
	/** Optional cookie access. */
	cookies?: {
		get(name: string): string | undefined;
		[name: string]: unknown;
	};
	/** Mutable per-request state bag. */
	state: State;
}

/**
 * Middleware continuation callback.
 */
export type JwtNext = () => unknown | Promise<unknown>;

/**
 * Token extraction source for the JWT middleware.
 */
export type JwtTokenSource = "authorization" | "cookie";
