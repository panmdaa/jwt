import type {
	Server as HttpServer,
	IncomingMessage,
	ServerResponse,
} from "node:http";
import type {
	Http2SecureServer,
	Http2Server,
	Http2ServerRequest,
	Http2ServerResponse,
} from "node:http2";
import type { TlsOptions } from "node:tls";
import type { WebSocketRouteOptions } from "../../ws";

export interface ServerOptions {
	/**
	 * Enable HTTP/2. When combined with `tls`, both HTTP/1.1 and HTTP/2 are
	 * served on the same TLS port, negotiated via ALPN.
	 */
	http2?: boolean;
	/** TLS options. When present, the server serves HTTPS. */
	tls?: TlsOptions;
	/**
	 * Maximum request body size in bytes. When the body exceeds this limit,
	 * reading it throws a `PayloadTooLargeError` and the server replies 413.
	 */
	maxBodySize?: number;
	/** Hook invoked with any error thrown while handling a request. */
	onError?: (error: unknown) => void;
	/** Shared options applied to every WebSocket route on this server. */
	websocket?: WebSocketRouteOptions;
}

/** Union of HTTP/1.x and HTTP/2 request objects. */
export type ServerRequest = IncomingMessage | Http2ServerRequest;

/** Union of HTTP/1.x and HTTP/2 response objects. */
export type ServerResponseLike = ServerResponse | Http2ServerResponse;

export type ServerInstance = HttpServer | Http2Server | Http2SecureServer;
