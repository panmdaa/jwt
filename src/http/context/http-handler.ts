import type { Path } from "../../router";
import type { ServerRequest, ServerResponseLike } from "../server";
import { ContextHandler } from "./context";
import { ResponseContext } from "./response";
import type { HttpMethod } from "./types";
import { parseCookies, parseQuery, requestHost, requestOrigin } from "./utils";

/**
 * HTTP handler context without a body surface: for methods that never carry
 * a payload (GET, HEAD, OPTIONS). Extends the base {@link ContextHandler}
 * with the response surface, query, cookies and request metadata.
 */
export class ContextHttpHandler<
	Url extends `/${string}`,
	State extends Record<string, unknown> = Record<string, unknown>,
	Query = Record<string, string | string[]>,
> extends ContextHandler<Url, ServerRequest, State, HttpMethod> {
	private cachedResponse: ResponseContext | null = null;

	private readonly res: ServerResponseLike;

	private cachedCookies: Record<string, string> | null = null;
	private cachedQuery: (Query & Record<string, string | string[]>) | null =
		null;
	private cachedHost: string | null = null;
	private cachedOrigin: string | null = null;
	private cachedIp: string | null = null;

	constructor(
		params: Path<Url>,
		search: string,
		request: ServerRequest,
		res: ServerResponseLike,
	) {
		super(params, search, request);

		this.res = res;
	}

	/**
	 * Response surface, allocated lazily: only requests whose handler actually
	 * sends a response pay for the object.
	 */
	get response(): ResponseContext {
		if (this.cachedResponse === null) {
			this.cachedResponse = new ResponseContext(this.res);
		}
		return this.cachedResponse;
	}

	get host(): string {
		if (this.cachedHost === null) this.cachedHost = requestHost(this.request);
		return this.cachedHost;
	}

	get ip(): string | undefined {
		if (this.cachedIp === null)
			this.cachedIp = this.request.socket.remoteAddress ?? null;

		return this.cachedIp ?? undefined;
	}

	get origin(): string {
		if (this.cachedOrigin === null)
			this.cachedOrigin = requestOrigin(this.request);
		return this.cachedOrigin;
	}

	get query(): Query & Record<string, string | string[]> {
		if (this.cachedQuery) return this.cachedQuery;

		this.cachedQuery = parseQuery(new URLSearchParams(this.search)) as Query &
			Record<string, string | string[]>;
		return this.cachedQuery as Query & Record<string, string | string[]>;
	}

	get cookies(): Record<string, string> {
		if (this.cachedCookies) return this.cachedCookies;

		this.cachedCookies = parseCookies(this.request.headers.cookie);
		return this.cachedCookies;
	}
}
