import type { Path } from "../../router";
import type { WebSocketConnection } from "../../ws/connection";
import type { WebSocketRequest } from "../../ws/types";
import { ContextHandler } from "./context";

/**
 * WebSocket handler context: extends the base {@link ContextHandler} with the
 * established {@link WebSocketConnection} for the current route.
 */
export class ContextWSHandler<
	Route extends `/${string}` = `/${string}`,
> extends ContextHandler<Route, WebSocketRequest> {
	constructor(
		public readonly socket: WebSocketConnection,
		params: Path<Route>,
		search: string,
		request: WebSocketRequest,
	) {
		super(params, search, request);
	}
}
