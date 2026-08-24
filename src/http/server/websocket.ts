import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { ServerHttp2Stream } from "node:http2";
import type { FindResult } from "../../router";
import type {
	NodeUpgradeSocket,
	WebSocketConnection,
	WebSocketRequest,
	WebSocketRouteOptions,
	WebSocketRouteStore,
} from "../../ws";
import {
	acceptExtendedConnectWebSocket,
	createHttp2StreamRequest,
	isExtendedConnectWebSocketRequest,
	rejectExtendedConnect,
	rejectUpgrade,
	upgradeWebSocket,
} from "../../ws";
import { ContextWSHandler } from "../context";
import type { ServerRequest } from "./types";

const NOT_FOUND = "Not Found";

type WebSocketMatch = FindResult<WebSocketRouteStore>;

interface WebSocketUpgraderDeps {
	findWebSocket: (path: string) => WebSocketMatch | undefined;
	options: WebSocketRouteOptions;
	onError?: (error: unknown) => void;
}

/**
 * Owns the WebSocket side of the server: upgrade handshakes (HTTP/1.1) and
 * extended CONNECT streams (HTTP/2), route resolution and handler dispatch.
 */
export class WebSocketUpgrader {
	constructor(private readonly deps: WebSocketUpgraderDeps) {}

	handleUpgrade(
		request: IncomingMessage,
		socket: NodeUpgradeSocket,
		head: Buffer,
	): void {
		const url = request.url ?? "/";
		const match = this.deps.findWebSocket(url);

		if (!match?.store) {
			rejectUpgrade(socket, 404, NOT_FOUND);
			return;
		}

		const wsRequest = createWebSocketRequest(request);

		upgradeWebSocket(wsRequest, socket, head, this.resolve(match))
			.then((connection) => {
				if (connection) this.runWebSocketHandler(connection, match, wsRequest);
			})
			.catch((error) => {
				this.handleWebSocketError(error, socket);
			});
	}

	/**
	 * Handles an HTTP/2 stream. Returns `true` when the stream was an extended
	 * CONNECT upgrade (consumed here), `false` when it is a regular request.
	 */
	handleStream(
		stream: ServerHttp2Stream,
		headers: IncomingHttpHeaders,
	): boolean {
		if (!isExtendedConnectWebSocketRequest(headers)) return false;

		const path = headers[":path"] ?? "/";
		const match = this.deps.findWebSocket(String(path));

		if (!match?.store) {
			rejectExtendedConnect(stream, 404, NOT_FOUND);
			return true;
		}

		const request = createHttp2StreamRequest(stream, headers);
		const wsRequest = createWebSocketRequest(request);

		acceptExtendedConnectWebSocket(wsRequest, stream, this.resolve(match))
			.then((connection) => {
				if (connection) this.runWebSocketHandler(connection, match, wsRequest);
			})
			.catch(() => {
				rejectExtendedConnect(stream, 400, "WebSocket upgrade failed");
			});

		return true;
	}

	private resolve(match: WebSocketMatch) {
		return {
			handler: match.store.handler,
			options: this.deps.options,
			params: match.params,
			search: match.search,
		};
	}

	private runWebSocketHandler(
		socket: WebSocketConnection,
		match: WebSocketMatch,
		request: WebSocketRequest,
	): void {
		const context = new ContextWSHandler(
			socket,
			match.params,
			match.search,
			request,
		);

		try {
			const result = match.store.handler(context as never);
			if (result && typeof (result as Promise<unknown>).then === "function") {
				void (result as Promise<unknown>).catch((error) => {
					socket.terminate();
					this.handleWebSocketError(error, socket.raw);
				});
			}
		} catch (error) {
			socket.terminate();
			this.handleWebSocketError(error, socket.raw);
		}
	}

	private handleWebSocketError(
		error: unknown,
		socket: NodeUpgradeSocket,
	): void {
		if (this.deps.onError) {
			try {
				this.deps.onError(error);
			} catch {
				// never let the error hook itself take the process down
			}
		}
		if (!socket.destroyed && !socket.writableEnded) {
			socket.destroy();
		}
	}
}

function createWebSocketRequest(request: ServerRequest): WebSocketRequest {
	return {
		method: request.method ?? "GET",
		url: request.url ?? "/",
		get(name: string): string | undefined {
			const value = request.headers[name.toLowerCase()];
			if (Array.isArray(value)) return value.join(", ");
			return value;
		},
		headers: request.headers,
	};
}
