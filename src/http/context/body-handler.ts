import type { Path } from "../../router";
import type { ServerRequest, ServerResponseLike } from "../server";
import { BodyContext } from "./body";
import { ContextHttpHandler } from "./http-handler";

/**
 * HTTP handler context with a lazily parsed request body: for methods that
 * carry a payload (POST, PUT, PATCH, DELETE, QUERY). Extends
 * {@link ContextHttpHandler} with the body surface.
 */
export class ContextBodyHandler<
	Url extends `/${string}`,
	Body extends Record<string, unknown> = Record<string, unknown>,
	State extends Record<string, unknown> = Record<string, unknown>,
	Query = Record<string, string | string[]>,
> extends ContextHttpHandler<Url, State, Query> {
	private cachedBodyContext: BodyContext<Body> | null = null;

	constructor(
		params: Path<Url>,
		search: string,
		request: ServerRequest,
		res: ServerResponseLike,
		private readonly maxBodySize?: number,
	) {
		super(params, search, request, res);
	}

	get body(): BodyContext<Body> {
		if (this.cachedBodyContext) return this.cachedBodyContext;

		this.cachedBodyContext = new BodyContext<Body>(
			this.request,
			this.headers["content-type"] ?? "text/plain",
			this.maxBodySize,
		);
		return this.cachedBodyContext;
	}
}
