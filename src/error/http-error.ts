import type { Status } from "../http";

/** Standard reason phrases for every 4xx/5xx status exposed by the type. */
export const STATUS_MESSAGES: Partial<Record<Status, string>> = {
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	407: "Proxy Authentication Required",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	411: "Length Required",
	412: "Precondition Failed",
	413: "Payload Too Large",
	414: "URI Too Long",
	415: "Unsupported Media Type",
	416: "Range Not Satisfiable",
	417: "Expectation Failed",
	418: "I'm a Teapot",
	419: "Authentication Timeout",
	420: "Enhance Your Calm",
	421: "Misdirected Request",
	422: "Unprocessable Content",
	423: "Locked",
	424: "Failed Dependency",
	425: "Too Early",
	426: "Upgrade Required",
	428: "Precondition Required",
	429: "Too Many Requests",
	431: "Request Header Fields Too Large",
	444: "No Response",
	450: "Blocked by Windows Parental Controls",
	451: "Unavailable For Legal Reasons",
	495: "SSL Certificate Error",
	496: "SSL Certificate Required",
	497: "HTTP Request Sent to HTTPS Port",
	499: "Client Closed Request",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
	506: "Variant Also Negotiates",
	507: "Insufficient Storage",
	508: "Loop Detected",
	509: "Bandwidth Limit Exceeded",
	510: "Not Extended",
	511: "Network Authentication Required",
	521: "Web Server Is Down",
	522: "Connection Timed Out",
	523: "Origin Is Unreachable",
	525: "SSL Handshake Failed",
	530: "Origin DNS Error",
	599: "Network Connect Timeout Error",
};

/**
 * Error carrying an HTTP status code. Throwing it from a handler makes the
 * server reply with that status, the message as the error body, and the
 * optional `description` as extra context (e.g. which field failed).
 */
export class HttpError extends Error {
	constructor(
		readonly status: Status,
		message?: string,
		readonly description?: string,
		override readonly cause?: unknown,
	) {
		super(message ?? STATUS_MESSAGES[status] ?? "Error");
		this.name = this.constructor.name;
	}
}

/** Type guard for any object that is an `HttpError`. */
export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}
