import { createServer as createHttpServer } from "node:http";
import {
	createSecureServer as createHttp2SecureServer,
	createServer as createHttp2Server,
} from "node:http2";
import { createServer as createHttpsServer } from "node:https";
import type {
	ServerInstance,
	ServerOptions,
	ServerRequest,
	ServerResponseLike,
} from "./types";

export function createNativeServer(
	options: ServerOptions,
	handler: (req: ServerRequest, res: ServerResponseLike) => void,
): ServerInstance {
	if (options.http2 && options.tls) {
		// Created WITHOUT a request handler so the Server can intercept every
		// stream (extended CONNECT for WebSocket vs regular requests).
		return createHttp2SecureServer({
			allowHTTP1: true,
			...options.tls,
			settings: { enableConnectProtocol: true },
		});
	}
	if (options.http2) {
		return createHttp2Server({
			settings: { enableConnectProtocol: true },
		});
	}
	if (options.tls) return createHttpsServer(options.tls, handler);
	return createHttpServer(handler);
}
