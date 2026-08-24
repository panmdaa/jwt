import { createHash } from "node:crypto";
import type { IncomingHttpHeaders, ServerHttp2Stream } from "node:http2";

import {
	negotiatePerMessageDeflate,
	perMessageDeflateResponseHeader,
} from "../compression/permessage-deflate";
import { createWebSocket, type WebSocketConnection } from "../connection";
import { DEFAULT_MAX_PAYLOAD } from "../constants";
import { statusMessage } from "../status";
import type {
	NodeUpgradeSocket,
	ResolvedWebSocketRoute,
	WebSocketRequest,
	WebSocketVerificationResult,
} from "../types";
import { parseSize } from "../utils";
import { writeHandshake } from "./flush";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const HTTP2_FORBIDDEN_RESPONSE_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-connection",
	"transfer-encoding",
	"upgrade",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const INVALID_HEADER_VALUE_PATTERN = /[\r\n]/u;
const KEY_PATTERN = /^[+/0-9A-Za-z]{22}==$/;
const TOKEN_PATTERN = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

function parseProtocols(headerValue: string | undefined): Set<string> {
	if (!headerValue) {
		return new Set();
	}

	const protocols = new Set<string>();

	for (const entry of headerValue.split(",")) {
		const protocol = entry.trim();

		if (!protocol) {
			continue;
		}

		if (!TOKEN_PATTERN.test(protocol)) {
			throw new TypeError("Invalid Sec-WebSocket-Protocol header");
		}

		protocols.add(protocol);
	}

	return protocols;
}

function normalizeVerificationResult(result: WebSocketVerificationResult): {
	headers?: Record<string, string>;
	message?: string;
	ok: boolean;
	status?: number;
} {
	if (typeof result === "boolean") {
		return { ok: result };
	}

	return result;
}

export function rejectUpgrade(
	socket: NodeUpgradeSocket,
	statusCode: number,
	message = statusMessage(statusCode),
	headers: Record<string, string> = {},
): void {
	if (!socket.writable) {
		socket.destroy();
		return;
	}

	const responseHeaders = {
		Connection: "close",
		"Content-Length": String(Buffer.byteLength(message)),
		"Content-Type": "text/plain; charset=utf-8",
		...sanitizeHttp1Headers(headers),
	};

	socket.end(
		`HTTP/1.1 ${statusCode} ${statusMessage(statusCode)}\r\n${Object.entries(
			responseHeaders,
		)
			.map(([name, value]) => `${name}: ${value}`)
			.join("\r\n")}\r\n\r\n${message}`,
	);
}

export function rejectExtendedConnect(
	stream: ServerHttp2Stream,
	statusCode: number,
	message = statusMessage(statusCode),
	headers: Record<string, string> = {},
): void {
	if (stream.destroyed) {
		return;
	}

	try {
		stream.respond({
			":status": statusCode,
			"content-length": String(Buffer.byteLength(message)),
			"content-type": "text/plain; charset=utf-8",
			...sanitizeHttp2Headers(headers),
		});
		stream.end(message);
	} catch {
		if (!stream.closed) {
			stream.close();
		}
	}
}

export async function upgradeWebSocket(
	request: WebSocketRequest,
	socket: NodeUpgradeSocket,
	head: Buffer,
	route: ResolvedWebSocketRoute,
): Promise<WebSocketConnection | undefined> {
	if (request.method !== "GET") {
		rejectUpgrade(socket, 405, "Invalid HTTP method");
		return undefined;
	}

	const upgrade = request.get("upgrade");
	const connection = request.get("connection");
	const key = request.get("sec-websocket-key");
	const version = request.get("sec-websocket-version");

	if (upgrade?.toLowerCase() !== "websocket") {
		rejectUpgrade(socket, 400, "Invalid Upgrade header");
		return undefined;
	}

	if (
		!connection
			?.toLowerCase()
			.split(/\s*,\s*/u)
			.includes("upgrade")
	) {
		rejectUpgrade(socket, 400, "Invalid Connection header");
		return undefined;
	}

	if (!key || !KEY_PATTERN.test(key)) {
		rejectUpgrade(socket, 400, "Missing or invalid Sec-WebSocket-Key header");
		return undefined;
	}

	if (version !== "13") {
		rejectUpgrade(
			socket,
			400,
			"Missing or invalid Sec-WebSocket-Version header",
			{
				"Sec-WebSocket-Version": "13",
			},
		);
		return undefined;
	}

	const session = await prepareWebSocketSession(route, request);

	if (!session.ok) {
		rejectUpgrade(
			socket,
			session.status ?? 401,
			session.message ?? "Unauthorized WebSocket client",
			session.headers ?? {},
		);
		return undefined;
	}

	const acceptValue = createHash("sha1")
		.update(key + GUID)
		.digest("base64");
	const headers = [
		"HTTP/1.1 101 Switching Protocols",
		"Connection: Upgrade",
		"Upgrade: websocket",
		`Sec-WebSocket-Accept: ${acceptValue}`,
	];

	if (session.selectedProtocol) {
		headers.push(`Sec-WebSocket-Protocol: ${session.selectedProtocol}`);
	}

	if (session.perMessageDeflate) {
		headers.push(
			`Sec-WebSocket-Extensions: ${perMessageDeflateResponseHeader()}`,
		);
	}

	for (const [name, value] of Object.entries(
		sanitizeHttp1Headers(session.extraHeaders),
	)) {
		headers.push(`${name}: ${value}`);
	}

	const response = `${headers.join("\r\n")}\r\n\r\n`;
	await writeHandshake(socket, response);

	if (
		head.byteLength > 0 &&
		"unshift" in socket &&
		typeof socket.unshift === "function"
	) {
		socket.unshift(head);
	}

	return createWebSocket(socket, {
		autoPong: route.options.autoPong ?? true,
		maxPayload: parseSize(route.options.maxPayload, DEFAULT_MAX_PAYLOAD),
		protocol: session.selectedProtocol ?? "",
		...(route.options.closeTimeout === undefined
			? {}
			: { closeTimeout: route.options.closeTimeout }),
		...(route.options.skipUTF8Validation === undefined
			? {}
			: { skipUTF8Validation: route.options.skipUTF8Validation }),
		...(session.perMessageDeflate
			? { perMessageDeflate: session.perMessageDeflate }
			: {}),
	});
}

export async function acceptExtendedConnectWebSocket(
	request: WebSocketRequest,
	stream: ServerHttp2Stream,
	route: ResolvedWebSocketRoute,
): Promise<WebSocketConnection | undefined> {
	if (request.method !== "CONNECT") {
		rejectExtendedConnect(stream, 405, "Invalid HTTP method");
		return undefined;
	}

	if (request.get(":protocol")?.toLowerCase() !== "websocket") {
		rejectExtendedConnect(stream, 400, "Invalid :protocol header");
		return undefined;
	}

	const version = request.get("sec-websocket-version");

	if (version !== "13") {
		rejectExtendedConnect(
			stream,
			400,
			"Missing or invalid Sec-WebSocket-Version header",
			{
				"sec-websocket-version": "13",
			},
		);
		return undefined;
	}

	const session = await prepareWebSocketSession(route, request);

	if (!session.ok) {
		rejectExtendedConnect(
			stream,
			session.status ?? 401,
			session.message ?? "Unauthorized WebSocket client",
			session.headers ?? {},
		);
		return undefined;
	}

	stream.respond({
		":status": 200,
		...(session.selectedProtocol
			? { "sec-websocket-protocol": session.selectedProtocol }
			: {}),
		...(session.perMessageDeflate
			? { "sec-websocket-extensions": perMessageDeflateResponseHeader() }
			: {}),
		...sanitizeHttp2Headers(session.extraHeaders),
	});

	return createWebSocket(stream, {
		autoPong: route.options.autoPong ?? true,
		maxPayload: parseSize(route.options.maxPayload, DEFAULT_MAX_PAYLOAD),
		protocol: session.selectedProtocol ?? "",
		...(route.options.closeTimeout === undefined
			? {}
			: { closeTimeout: route.options.closeTimeout }),
		...(route.options.skipUTF8Validation === undefined
			? {}
			: { skipUTF8Validation: route.options.skipUTF8Validation }),
		...(session.perMessageDeflate
			? { perMessageDeflate: session.perMessageDeflate }
			: {}),
	});
}

type PreparedWebSocketSession =
	| {
			headers: Record<string, string> | undefined;
			message: string | undefined;
			ok: false;
			status: number | undefined;
	  }
	| {
			extraHeaders: Record<string, string>;
			ok: true;
			perMessageDeflate: ReturnType<typeof negotiatePerMessageDeflate>;
			selectedProtocol: string | undefined;
	  };

async function prepareWebSocketSession(
	route: ResolvedWebSocketRoute,
	request: WebSocketRequest,
): Promise<PreparedWebSocketSession> {
	if (route.options.verifyClient) {
		const result = normalizeVerificationResult(
			await route.options.verifyClient(request as never),
		);

		if (!result.ok) {
			return {
				headers: result.headers,
				message: result.message,
				ok: false,
				status: result.status,
			};
		}
	}

	const requestedProtocols = parseProtocols(
		request.get("sec-websocket-protocol"),
	);

	return {
		extraHeaders:
			typeof route.options.headers === "function"
				? await route.options.headers(request as never)
				: (route.options.headers ?? {}),
		ok: true,
		perMessageDeflate: negotiatePerMessageDeflate(
			request.get("sec-websocket-extensions"),
			route.options.perMessageDeflate,
		),
		selectedProtocol: await selectProtocol(route, request, requestedProtocols),
	};
}

async function selectProtocol(
	route: ResolvedWebSocketRoute,
	request: WebSocketRequest,
	requestedProtocols: ReadonlySet<string>,
): Promise<string | undefined> {
	if (route.options.handleProtocols) {
		const selected = await route.options.handleProtocols(
			requestedProtocols,
			request as never,
		);

		if (selected && !requestedProtocols.has(selected)) {
			throw new TypeError(
				`Selected WebSocket protocol "${selected}" was not requested by the client`,
			);
		}

		return selected || undefined;
	}

	if (route.options.protocols && route.options.protocols.length > 0) {
		return route.options.protocols.find((protocol) =>
			requestedProtocols.has(protocol),
		);
	}

	return requestedProtocols.values().next().value;
}

function sanitizeHttp2Headers(
	headers: Record<string, string>,
): IncomingHttpHeaders {
	const sanitized: IncomingHttpHeaders = {};

	for (const [name, value] of Object.entries(headers)) {
		if (
			!isSafeHeader(name, value) ||
			HTTP2_FORBIDDEN_RESPONSE_HEADERS.has(name.toLowerCase())
		) {
			continue;
		}

		sanitized[name.toLowerCase()] = value;
	}

	return sanitized;
}

function sanitizeHttp1Headers(
	headers: Record<string, string>,
): Record<string, string> {
	const sanitized: Record<string, string> = {};

	for (const [name, value] of Object.entries(headers)) {
		if (!isSafeHeader(name, value)) {
			continue;
		}

		sanitized[name] = value;
	}

	return sanitized;
}

function isSafeHeader(name: string, value: string): boolean {
	return (
		HEADER_NAME_PATTERN.test(name) && !INVALID_HEADER_VALUE_PATTERN.test(value)
	);
}
