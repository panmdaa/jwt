import type { IncomingHttpHeaders } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import type { TLSSocket } from "node:tls";
import type { ContextWSHandler } from "../http/context/ws-handler";
import type { Next } from "../http/handler/types";
import type { CloseCode, WebSocketState } from "./constants";

export type RequestTransport = "http" | "https" | "http2" | "http2s";

export type SizeUnit = "b" | "kb" | "mb" | "gb";

export type SizeInput = number | `${number}${SizeUnit}`;

export type NodeUpgradeSocket = Socket | TLSSocket | Duplex;

export type MaybePromise<T> = T | PromiseLike<T>;

export type WebSocketVerificationResult =
	| boolean
	| {
			headers?: Record<string, string>;
			message?: string;
			ok: boolean;
			status?: number;
	  };

export interface PerMessageDeflateOptions {
	concurrencyLimit?: number;
	level?: number;
	memLevel?: number;
	threshold?: SizeInput;
}

export interface NegotiatedPerMessageDeflate {
	clientNoContextTakeover: true;
	concurrencyLimit: number;
	level: number;
	memLevel: number;
	serverNoContextTakeover: true;
	threshold: number;
}

export interface WebSocketHeartbeatOptions {
	closeCode?: CloseCode;
	closeReason?: string;
	intervalMs?: number;
	payload?: string | Uint8Array | ArrayBuffer | ArrayBufferView;
	timeoutMs?: number;
}

export interface WebSocketConnectionOptions {
	autoPong?: boolean;
	closeTimeout?: number;
	maxPayload?: number;
	perMessageDeflate?: NegotiatedPerMessageDeflate;
	protocol?: string;
	skipUTF8Validation?: boolean;
}

export type NormalizedWebSocketConnectionOptions = {
	autoPong: boolean;
	closeTimeout: number;
	maxPayload: number;
	perMessageDeflate?: NegotiatedPerMessageDeflate;
	protocol: string;
	skipUTF8Validation: boolean;
};

export interface WebSocketCloseEvent {
	code: number;
	reason: string;
	wasClean: boolean;
}

export interface WebSocketMessageEvent {
	data: string | Uint8Array;
	isBinary: boolean;
}

export interface WebSocketEvents {
	binary: [data: Uint8Array];
	close: [event: WebSocketCloseEvent];
	drain: [];
	error: [error: Error];
	message: [event: WebSocketMessageEvent];
	ping: [data: Uint8Array];
	pong: [data: Uint8Array];
	text: [data: string];
}

/**
 * Minimal request surface consumed by the WebSocket handshake. Wraps a native
 * HTTP request (HTTP/1.x, HTTP/2 or a synthesized HTTP/2 stream request).
 */
export interface WebSocketRequest {
	method: string;
	url: string;
	get(name: string): string | undefined;
	readonly headers: IncomingHttpHeaders;
}

export interface WebSocketRouteOptions {
	autoPong?: boolean;
	closeTimeout?: number;
	headers?:
		| Record<string, string>
		| ((request: WebSocketRequest) => MaybePromise<Record<string, string>>);
	handleProtocols?: (
		protocols: ReadonlySet<string>,
		request: WebSocketRequest,
	) => MaybePromise<string | false | undefined>;
	maxPayload?: SizeInput;
	perMessageDeflate?: boolean | PerMessageDeflateOptions;
	protocols?: readonly string[];
	skipUTF8Validation?: boolean;
	verifyClient?: (
		request: WebSocketRequest,
	) => MaybePromise<WebSocketVerificationResult>;
}

export type WebSocketHandler<Route extends `/${string}` = `/${string}`> = (
	context: ContextWSHandler<Route>,
	next?: Next,
) => MaybePromise<void>;

/**
 * WebSocket middleware: like {@link WebSocketHandler} but with a required
 * `next` callback so it can run before the final handler and short-circuit
 * the chain, mirroring HTTP middlewares.
 */
export type WebSocketMiddleware<Route extends `/${string}` = `/${string}`> = (
	context: ContextWSHandler<Route>,
	next: Next,
) => MaybePromise<void>;

export interface WebSocketRouteStore {
	handler: WebSocketHandler;
	path?: string;
}

export interface ResolvedWebSocketRoute {
	handler: WebSocketHandler;
	options: WebSocketRouteOptions;
	params: Record<string, string>;
	search: string;
}

export interface WebSocketStateLike {
	readonly readyState: WebSocketState;
}
