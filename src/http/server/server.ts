import type { IncomingHttpHeaders } from "node:http";
import type { ServerHttp2Stream } from "node:http2";
import type { AddressInfo } from "node:net";
import { HttpError } from "../../error";
import { Router } from "../../router";
import { createHttp2StreamRequest, Http2StreamResponse } from "../../ws";
import { ContextBodyHandler, ContextHttpHandler } from "../context";
import type { Handler } from "../handler";
import { NO_OP } from "./constants";
import type {
	ServerInstance,
	ServerOptions,
	ServerRequest,
	ServerResponseLike,
} from "./types";
import { createNativeServer } from "./utils";
import { WebSocketUpgrader } from "./websocket";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const NOT_FOUND = "Not Found";
const METHOD_NOT_ALLOWED = "Method Not Allowed";
const INTERNAL_SERVER_ERROR = "Internal Server Error";

export class Server extends Router {
	public readonly native: ServerInstance;
	private readonly serverOptions: ServerOptions;
	private readonly websocket: WebSocketUpgrader;

	constructor(options: ServerOptions = {}) {
		super();
		this.serverOptions = options;
		this.websocket = new WebSocketUpgrader({
			findWebSocket: (path) => this.findWebSocket(path),
			options: options.websocket ?? {},
			onError: options.onError,
		});
		this.native = createNativeServer(options, (req, res) => {
			this.request(req, res);
		});

		if (options.http2) {
			// With allowHTTP1, HTTP/1.1 clients that fall back via ALPN arrive
			// as regular `request` events on the http2 server. HTTP/2 streams
			// are handled exclusively through `stream`: when both listeners are
			// present Node emits `stream` AND `request` for the same stream,
			// which would respond twice and throw ERR_HTTP2_HEADERS_SENT.
			this.native.on("request", (req, res) => {
				if (req.httpVersionMajor === 2) return;
				this.request(req, res);
			});
			this.native.on("stream", (stream, headers) => {
				this.handleStream(stream, headers);
			});
		}
		this.native.on("upgrade", (req, socket, head) => {
			this.websocket.handleUpgrade(req, socket, head);
		});
	}

	listen(port: number) {
		this.native.listen(port);
	}

	address(): AddressInfo | undefined {
		return this.native.address() as AddressInfo;
	}

	close() {
		this.native.close();
	}

	private handleStream(
		stream: ServerHttp2Stream,
		headers: IncomingHttpHeaders,
	) {
		if (this.websocket.handleStream(stream, headers)) return;

		const request = createHttp2StreamRequest(stream, headers);
		const response = new Http2StreamResponse(stream);
		const responseLike = response as unknown as ServerResponseLike;
		this.request(request, responseLike);
	}

	/**
	 * Builds the context class for a method: requests that may carry a payload
	 * get the body surface, the rest only the HTTP surface.
	 */
	private createContext(
		method: string,
		handler: {
			params: Record<string, string>;
			search: string;
		},
		request: ServerRequest,
		response: ServerResponseLike,
	): ContextHttpHandler<`/${string}`> | ContextBodyHandler<`/${string}`> {
		switch (method) {
			case "POST":
			case "PUT":
			case "PATCH":
			case "DELETE":
			case "QUERY":
				return new ContextBodyHandler(
					handler.params,
					handler.search,
					request,
					response,
					this.serverOptions.maxBodySize,
				);
			default:
				return new ContextHttpHandler(
					handler.params,
					handler.search,
					request,
					response,
				);
		}
	}

	private run(
		handler: {
			store: Handler<any>;
			params: Record<string, string>;
			search: string;
		},
		method: string,
		request: ServerRequest,
		response: ServerResponseLike,
	): void {
		const context = this.createContext(method, handler, request, response);
		const result = handler.store(context as never, NO_OP);

		if (
			result !== undefined &&
			typeof (result as Promise<unknown>).then === "function"
		) {
			// Async handler: wait for it, then fall through to the auto-end.
			// Only async handlers allocate a promise here.
			(result as Promise<unknown>).then(
				() => {
					if (!response.writableEnded) response.end();
				},
				(error) => this.handleError(error, response),
			);
			return;
		}

		if (!response.writableEnded) response.end();
	}

	private request(request: ServerRequest, response: ServerResponseLike): void {
		const url = request.url ?? "/";
		const method = request.method ?? "GET";

		const handler = this.find(method, url);

		if (handler?.store) {
			try {
				this.run(handler, method, request, response);
			} catch (error) {
				this.handleError(error, response);
			}
			return;
		}

		// The path matches a different method: reply 405 with an Allow header.
		if (method === "HEAD") {
			const get = this.find("GET", url);
			if (get?.store) {
				try {
					this.run(get, "GET", request, response);
				} catch (error) {
					this.handleError(error, response);
				}
				return;
			}
		}

		// OPTIONS without an explicit handler: advertise the allowed methods.
		if (method === "OPTIONS") {
			const allowed = this.radixTree.methods(url);
			if (allowed.length > 0) {
				response.statusCode = 200;
				response.setHeader("Allow", allowed.join(", "));
				response.setHeader("Content-Length", "0");
				response.end();
				return;
			}
		}

		const allowed = this.radixTree.methods(url);
		if (allowed.length > 0) {
			response.statusCode = 405;
			response.setHeader("Allow", allowed.join(", "));
			response.setHeader("Content-Type", JSON_CONTENT_TYPE);
			response.end(
				JSON.stringify({ status: 405, message: METHOD_NOT_ALLOWED }),
			);
			return;
		}

		response.statusCode = 404;
		response.setHeader("Content-Type", JSON_CONTENT_TYPE);
		response.end(JSON.stringify({ status: 404, message: NOT_FOUND }));
	}

	private handleError(error: unknown, response: ServerResponseLike) {
		if (this.serverOptions.onError) {
			try {
				this.serverOptions.onError(error);
			} catch {
				// never let the error hook itself take the process down
			}
		}

		if (response.writableEnded || response.headersSent) return;

		// Known HTTP errors (BadRequest, PayloadTooLarge, ...) expose their
		// status, message and optional description; anything else is an
		// internal error.
		if (error instanceof HttpError) {
			const body: Record<string, unknown> = {
				status: error.status,
				message: error.message,
			};
			if (error.description !== undefined) body.description = error.description;

			response.statusCode = error.status;
			response.setHeader("Content-Type", JSON_CONTENT_TYPE);
			response.end(JSON.stringify(body));
			return;
		}

		response.statusCode = 500;
		response.setHeader("Content-Type", JSON_CONTENT_TYPE);
		response.end(
			JSON.stringify({ status: 500, message: INTERNAL_SERVER_ERROR }),
		);
	}
}
