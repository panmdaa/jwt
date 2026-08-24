import type { ContextBodyHandler, ContextHttpHandler } from "../http/context";
import { compileHandler, type Handler } from "../http/handler";
import type { WebSocketHandler, WebSocketRouteStore } from "../ws";
import { HTTP_METHODS } from "./constants";
import { type FindResult, RadixTree } from "./radix-tree";
import type { RouteEntry } from "./types";
import { joinPath, normalizePrefix } from "./utils";

// Pseudo-method key used to isolate WebSocket routes from the HTTP verb tree.
const WS_METHOD = "WS";

export class Router {
	protected prefix: string;
	protected radixTree = new RadixTree<Handler<any>>();
	protected routes: RouteEntry[] = [];
	protected middlewares: Handler[] = [];
	protected wsTree = new RadixTree<WebSocketRouteStore>();
	protected wsRoutes: WebSocketRouteStore[] = [];

	constructor(prefix: string = "") {
		this.prefix = normalizePrefix(prefix);
	}

	use(...middleware: Handler<any>[]): this {
		this.middlewares.push(...(middleware as Handler[]));
		return this;
	}

	protected addRoute(
		method: string,
		path: string,
		handler: Handler<any>,
	): this {
		const fullPath = joinPath(this.prefix, path);
		const composed =
			this.middlewares.length > 0
				? compileHandler(...this.middlewares, handler)
				: handler;
		this.radixTree.add(method, fullPath, composed);
		this.routes.push([method, fullPath, composed]);
		return this;
	}

	protected addWebSocketRoute(path: string, handler: WebSocketHandler): this {
		const fullPath = joinPath(this.prefix, path);
		const composed =
			this.middlewares.length > 0
				? (compileHandler(
						...this.middlewares,
						handler,
					) as unknown as WebSocketHandler)
				: handler;
		const store: WebSocketRouteStore = { handler: composed, path: fullPath };
		this.wsTree.add(WS_METHOD, fullPath, store);
		this.wsRoutes.push(store);
		return this;
	}

	protected findWebSocket(
		path: string,
	): FindResult<WebSocketRouteStore> | undefined {
		return (
			(this.wsTree.find(
				WS_METHOD,
				path,
			) as FindResult<WebSocketRouteStore> | null) ?? undefined
		);
	}

	protected find<
		P extends `/${string}` = `/${string}`,
		Body extends Record<string, unknown> = Record<string, unknown>,
	>(
		method: string,
		path: string,
	): FindResult<Handler<ContextBodyHandler<P, Body>>> | undefined {
		return (
			(this.radixTree.find(method, path) as FindResult<
				Handler<ContextBodyHandler<P, Body>>
			> | null) ?? undefined
		);
	}

	router(child: Router): this;
	router<P extends `/${string}`>(prefix: P, child: Router): this;
	router(prefixOrChild: string | Router, maybeChild?: Router): this {
		const hasPrefix = typeof prefixOrChild === "string";
		const child = hasPrefix ? maybeChild : prefixOrChild;
		if (!child) return this;

		const prefix = hasPrefix ? normalizePrefix(prefixOrChild) : "";

		for (const [method, path, handler] of child.routes)
			this.addRoute(method, joinPath(prefix, path), handler);
		for (const entry of child.wsRoutes)
			this.addWebSocketRoute(joinPath(prefix, entry.path ?? ""), entry.handler);

		return this;
	}

	group<P extends `/${string}`>(prefix: P, fn: (router: Router) => void): this {
		const child = new Router(prefix);
		fn(child);
		return this.router(child);
	}

	all<P extends `/${string}`, Body extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextBodyHandler<P, Body>>>
	): this {
		const handler = compileHandler(...value);
		for (const method of HTTP_METHODS) this.addRoute(method, path, handler);
		return this;
	}

	get<P extends `/${string}`, State extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextHttpHandler<P, State>>>
	) {
		return this.addRoute("GET", path, compileHandler(...value));
	}

	query<P extends `/${string}`, Body extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextBodyHandler<P, Body>>>
	) {
		return this.addRoute("QUERY", path, compileHandler(...value));
	}

	head<P extends `/${string}`, State extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextHttpHandler<P, State>>>
	) {
		return this.addRoute("HEAD", path, compileHandler(...value));
	}

	post<P extends `/${string}`, Body extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextBodyHandler<P, Body>>>
	) {
		return this.addRoute("POST", path, compileHandler(...value));
	}

	put<P extends `/${string}`, Body extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextBodyHandler<P, Body>>>
	) {
		return this.addRoute("PUT", path, compileHandler(...value));
	}

	delete<P extends `/${string}`, Body extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextBodyHandler<P, Body>>>
	) {
		return this.addRoute("DELETE", path, compileHandler(...value));
	}

	patch<P extends `/${string}`, Body extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextBodyHandler<P, Body>>>
	) {
		return this.addRoute("PATCH", path, compileHandler(...value));
	}

	options<P extends `/${string}`, State extends Record<string, unknown>>(
		path: P,
		...value: Array<Handler<ContextHttpHandler<P, State>>>
	) {
		return this.addRoute("OPTIONS", path, compileHandler(...value));
	}

	ws<Route extends `/${string}`>(
		path: Route,
		...handlers: Array<WebSocketHandler<Route>>
	): this {
		return this.addWebSocketRoute(
			path,
			compileHandler(...handlers) as unknown as WebSocketHandler<Route>,
		);
	}
}
