import type {
	IncomingHttpHeaders,
	OutgoingHttpHeaders,
	ServerHttp2Stream,
} from "node:http2";
import type { Duplex } from "node:stream";
import { Writable } from "node:stream";
import type { ServerRequest } from "../../http/server";

function getHeaderValue(
	headers: IncomingHttpHeaders,
	name: string,
): string | undefined {
	const value = headers[name];

	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

export function isExtendedConnectWebSocketRequest(
	headers: IncomingHttpHeaders,
): boolean {
	const method = getHeaderValue(headers, ":method");
	const protocol = getHeaderValue(headers, ":protocol");

	return (
		method?.toUpperCase() === "CONNECT" &&
		protocol?.toLowerCase() === "websocket"
	);
}

/**
 * Build a minimal request object from an HTTP/2 stream so the existing
 * HTTP handler can process regular HTTP/2 requests without Node's native
 * request/response conversion (which would also consume extended CONNECT
 * streams).
 */
export function createHttp2StreamRequest(
	stream: ServerHttp2Stream,
	headers: IncomingHttpHeaders,
): ServerRequest {
	const authority =
		getHeaderValue(headers, ":authority") ??
		getHeaderValue(headers, "host") ??
		"";
	const requestHeaders: IncomingHttpHeaders = {
		...headers,
		host: authority,
	};

	const request = {
		destroy(error?: Error): void {
			stream.destroy(error);
		},
		headers: requestHeaders,
		httpVersion: "2.0",
		httpVersionMajor: 2,
		method: getHeaderValue(headers, ":method")?.toUpperCase() ?? "GET",
		on(event: string, listener: (...args: unknown[]) => void) {
			stream.on(event, listener);
			return request;
		},
		once(event: string, listener: (...args: unknown[]) => void) {
			stream.once(event, listener);
			return request;
		},
		socket: (stream.session?.socket ?? stream) as Duplex,
		url: getHeaderValue(headers, ":path") ?? "/",
	};

	return request as unknown as ServerRequest;
}

/**
 * Minimal ServerResponse-like wrapper over an HTTP/2 stream. Defers the
 * `respond()` call until the first write or end, mirroring the semantics of
 * `ServerResponse` while avoiding Node's internal CONNECT interception.
 */
export class Http2StreamResponse extends Writable {
	headersSent = false;
	statusCode = 200;

	private readonly headers = new Map<string, number | string | string[]>();

	constructor(private readonly stream: ServerHttp2Stream) {
		super();
		stream.on("close", () => {
			if (!this.destroyed) {
				this.destroy();
			}
		});
	}

	getHeader(name: string): number | string | string[] | undefined {
		return this.headers.get(name.toLowerCase());
	}

	removeHeader(name: string): void {
		this.headers.delete(name.toLowerCase());
	}

	setHeader(name: string, value: number | string | readonly string[]): void {
		const normalized: number | string | string[] =
			typeof value === "number" || typeof value === "string"
				? value
				: [...value];
		this.headers.set(name.toLowerCase(), normalized);
	}

	writeHead(
		statusCode: number,
		headers?: OutgoingHttpHeaders | undefined,
	): this {
		this.statusCode = statusCode;

		if (headers) {
			for (const [name, value] of Object.entries(headers)) {
				if (value !== undefined) {
					this.setHeader(name, value);
				}
			}
		}

		this.respond();
		return this;
	}

	override _final(callback: (error?: Error | null) => void): void {
		this.respond();
		this.stream.end();
		callback();
	}

	override _write(
		chunk: Buffer | string,
		encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		this.respond();

		if (typeof chunk === "string") {
			this.stream.write(chunk, encoding, callback);
			return;
		}

		this.stream.write(chunk, callback);
	}

	private respond(): void {
		if (this.headersSent || this.stream.destroyed || this.stream.closed) {
			return;
		}

		const responseHeaders: OutgoingHttpHeaders = {
			":status": this.statusCode,
		};

		for (const [name, value] of this.headers) {
			responseHeaders[name] = value;
		}

		this.stream.respond(responseHeaders);
		this.headersSent = true;
	}
}
