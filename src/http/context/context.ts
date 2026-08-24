import type { Path } from "../../router";
import type { ServerRequest } from "../server";

/** Minimal request surface required by {@link ContextHandler}. */
export interface ContextRequest {
	method?: string;
	url?: string;
	headers: Record<string, string | string[] | undefined>;
}

/**
 * Base context shared by every handler type. HTTP handlers receive a
 * {@link ContextBodyHandler} and WebSocket handlers a
 * {@link ContextWSHandler}; both extend this class.
 */
export class ContextHandler<
	Url extends `/${string}`,
	Req extends ContextRequest = ServerRequest,
	State extends Record<string, unknown> = Record<string, unknown>,
	Method extends string = string,
> {
	readonly method: Method;
	readonly url: string;

	readonly headers: Req["headers"];

	readonly params: Path<Url>;
	readonly search: string;
	readonly request: Req;

	private cachedState: State | undefined;
	private cachedWildcard: string | null = null;

	constructor(params: Path<Url>, search: string, request: Req) {
		this.method = (request.method ?? "GET") as Method;
		this.url = request.url ?? "/";

		this.headers = request.headers;

		this.params = params;
		this.search = search;
		this.request = request;
	}

	/**
	 * Per-request mutable state, allocated lazily: only requests that actually
	 * touch `state` pay for the object.
	 */
	get state(): State {
		if (this.cachedState === undefined) this.cachedState = {} as State;
		return this.cachedState;
	}

	get wildcard(): string | undefined {
		if (this.cachedWildcard === null)
			this.cachedWildcard = this.params["*"] ?? null;

		return this.cachedWildcard ?? undefined;
	}
}
