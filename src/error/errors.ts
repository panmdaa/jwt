import type { Status } from "../http";
import { HttpError } from "./http-error";

export class BadRequest extends HttpError {
	static readonly status: Status = 400;

	constructor(
		message: string = "Bad Request",
		description?: string,
		cause?: unknown,
	) {
		super(400, message, description, cause);
	}
}

export class Unauthorized extends HttpError {
	static readonly status: Status = 401;

	constructor(
		message: string = "Unauthorized",
		description?: string,
		cause?: unknown,
	) {
		super(401, message, description, cause);
	}
}

export class PaymentRequired extends HttpError {
	static readonly status: Status = 402;

	constructor(
		message: string = "Payment Required",
		description?: string,
		cause?: unknown,
	) {
		super(402, message, description, cause);
	}
}

export class Forbidden extends HttpError {
	static readonly status: Status = 403;

	constructor(
		message: string = "Forbidden",
		description?: string,
		cause?: unknown,
	) {
		super(403, message, description, cause);
	}
}

export class NotFound extends HttpError {
	static readonly status: Status = 404;

	constructor(
		message: string = "Not Found",
		description?: string,
		cause?: unknown,
	) {
		super(404, message, description, cause);
	}
}

export class NotAcceptable extends HttpError {
	static readonly status: Status = 406;

	constructor(
		message: string = "Not Acceptable",
		description?: string,
		cause?: unknown,
	) {
		super(406, message, description, cause);
	}
}

export class ProxyAuthenticationRequired extends HttpError {
	static readonly status: Status = 407;

	constructor(
		message: string = "Proxy Authentication Required",
		description?: string,
		cause?: unknown,
	) {
		super(407, message, description, cause);
	}
}

export class RequestTimeout extends HttpError {
	static readonly status: Status = 408;

	constructor(
		message: string = "Request Timeout",
		description?: string,
		cause?: unknown,
	) {
		super(408, message, description, cause);
	}
}

export class Conflict extends HttpError {
	static readonly status: Status = 409;

	constructor(
		message: string = "Conflict",
		description?: string,
		cause?: unknown,
	) {
		super(409, message, description, cause);
	}
}

export class Gone extends HttpError {
	static readonly status: Status = 410;

	constructor(message: string = "Gone", description?: string, cause?: unknown) {
		super(410, message, description, cause);
	}
}

export class LengthRequired extends HttpError {
	static readonly status: Status = 411;

	constructor(
		message: string = "Length Required",
		description?: string,
		cause?: unknown,
	) {
		super(411, message, description, cause);
	}
}

export class PreconditionFailed extends HttpError {
	static readonly status: Status = 412;

	constructor(
		message: string = "Precondition Failed",
		description?: string,
		cause?: unknown,
	) {
		super(412, message, description, cause);
	}
}

export class UriTooLong extends HttpError {
	static readonly status: Status = 414;

	constructor(
		message: string = "URI Too Long",
		description?: string,
		cause?: unknown,
	) {
		super(414, message, description, cause);
	}
}

export class RangeNotSatisfiable extends HttpError {
	static readonly status: Status = 416;

	constructor(
		message: string = "Range Not Satisfiable",
		description?: string,
		cause?: unknown,
	) {
		super(416, message, description, cause);
	}
}

export class ExpectationFailed extends HttpError {
	static readonly status: Status = 417;

	constructor(
		message: string = "Expectation Failed",
		description?: string,
		cause?: unknown,
	) {
		super(417, message, description, cause);
	}
}

export class ImATeapot extends HttpError {
	static readonly status: Status = 418;

	constructor(
		message: string = "I'm a Teapot",
		description?: string,
		cause?: unknown,
	) {
		super(418, message, description, cause);
	}
}

export class AuthenticationTimeout extends HttpError {
	static readonly status: Status = 419;

	constructor(
		message: string = "Authentication Timeout",
		description?: string,
		cause?: unknown,
	) {
		super(419, message, description, cause);
	}
}

export class EnhanceYourCalm extends HttpError {
	static readonly status: Status = 420;

	constructor(
		message: string = "Enhance Your Calm",
		description?: string,
		cause?: unknown,
	) {
		super(420, message, description, cause);
	}
}

export class MisdirectedRequest extends HttpError {
	static readonly status: Status = 421;

	constructor(
		message: string = "Misdirected Request",
		description?: string,
		cause?: unknown,
	) {
		super(421, message, description, cause);
	}
}

export class UnprocessableContent extends HttpError {
	static readonly status: Status = 422;

	constructor(
		message: string = "Unprocessable Content",
		description?: string,
		cause?: unknown,
	) {
		super(422, message, description, cause);
	}
}

export class Locked extends HttpError {
	static readonly status: Status = 423;

	constructor(
		message: string = "Locked",
		description?: string,
		cause?: unknown,
	) {
		super(423, message, description, cause);
	}
}

export class FailedDependency extends HttpError {
	static readonly status: Status = 424;

	constructor(
		message: string = "Failed Dependency",
		description?: string,
		cause?: unknown,
	) {
		super(424, message, description, cause);
	}
}

export class TooEarly extends HttpError {
	static readonly status: Status = 425;

	constructor(
		message: string = "Too Early",
		description?: string,
		cause?: unknown,
	) {
		super(425, message, description, cause);
	}
}

export class UpgradeRequired extends HttpError {
	static readonly status: Status = 426;

	constructor(
		message: string = "Upgrade Required",
		description?: string,
		cause?: unknown,
	) {
		super(426, message, description, cause);
	}
}

export class PreconditionRequired extends HttpError {
	static readonly status: Status = 428;

	constructor(
		message: string = "Precondition Required",
		description?: string,
		cause?: unknown,
	) {
		super(428, message, description, cause);
	}
}

export class TooManyRequests extends HttpError {
	static readonly status: Status = 429;

	constructor(
		message: string = "Too Many Requests",
		description?: string,
		cause?: unknown,
	) {
		super(429, message, description, cause);
	}
}

export class RequestHeaderFieldsTooLarge extends HttpError {
	static readonly status: Status = 431;

	constructor(
		message: string = "Request Header Fields Too Large",
		description?: string,
		cause?: unknown,
	) {
		super(431, message, description, cause);
	}
}

export class NoResponse extends HttpError {
	static readonly status: Status = 444;

	constructor(
		message: string = "No Response",
		description?: string,
		cause?: unknown,
	) {
		super(444, message, description, cause);
	}
}

export class BlockedByWindowsParentalControls extends HttpError {
	static readonly status: Status = 450;

	constructor(
		message: string = "Blocked by Windows Parental Controls",
		description?: string,
		cause?: unknown,
	) {
		super(450, message, description, cause);
	}
}

export class UnavailableForLegalReasons extends HttpError {
	static readonly status: Status = 451;

	constructor(
		message: string = "Unavailable For Legal Reasons",
		description?: string,
		cause?: unknown,
	) {
		super(451, message, description, cause);
	}
}

export class SslCertificateError extends HttpError {
	static readonly status: Status = 495;

	constructor(
		message: string = "SSL Certificate Error",
		description?: string,
		cause?: unknown,
	) {
		super(495, message, description, cause);
	}
}

export class SslCertificateRequired extends HttpError {
	static readonly status: Status = 496;

	constructor(
		message: string = "SSL Certificate Required",
		description?: string,
		cause?: unknown,
	) {
		super(496, message, description, cause);
	}
}

export class HttpRequestSentToHttpsPort extends HttpError {
	static readonly status: Status = 497;

	constructor(
		message: string = "HTTP Request Sent to HTTPS Port",
		description?: string,
		cause?: unknown,
	) {
		super(497, message, description, cause);
	}
}

export class ClientClosedRequest extends HttpError {
	static readonly status: Status = 499;

	constructor(
		message: string = "Client Closed Request",
		description?: string,
		cause?: unknown,
	) {
		super(499, message, description, cause);
	}
}

export class InternalServerError extends HttpError {
	static readonly status: Status = 500;

	constructor(
		message: string = "Internal Server Error",
		description?: string,
		cause?: unknown,
	) {
		super(500, message, description, cause);
	}
}

export class NotImplemented extends HttpError {
	static readonly status: Status = 501;

	constructor(
		message: string = "Not Implemented",
		description?: string,
		cause?: unknown,
	) {
		super(501, message, description, cause);
	}
}

export class BadGateway extends HttpError {
	static readonly status: Status = 502;

	constructor(
		message: string = "Bad Gateway",
		description?: string,
		cause?: unknown,
	) {
		super(502, message, description, cause);
	}
}

export class ServiceUnavailable extends HttpError {
	static readonly status: Status = 503;

	constructor(
		message: string = "Service Unavailable",
		description?: string,
		cause?: unknown,
	) {
		super(503, message, description, cause);
	}
}

export class GatewayTimeout extends HttpError {
	static readonly status: Status = 504;

	constructor(
		message: string = "Gateway Timeout",
		description?: string,
		cause?: unknown,
	) {
		super(504, message, description, cause);
	}
}

export class HttpVersionNotSupported extends HttpError {
	static readonly status: Status = 505;

	constructor(
		message: string = "HTTP Version Not Supported",
		description?: string,
		cause?: unknown,
	) {
		super(505, message, description, cause);
	}
}

export class VariantAlsoNegotiates extends HttpError {
	static readonly status: Status = 506;

	constructor(
		message: string = "Variant Also Negotiates",
		description?: string,
		cause?: unknown,
	) {
		super(506, message, description, cause);
	}
}

export class InsufficientStorage extends HttpError {
	static readonly status: Status = 507;

	constructor(
		message: string = "Insufficient Storage",
		description?: string,
		cause?: unknown,
	) {
		super(507, message, description, cause);
	}
}

export class LoopDetected extends HttpError {
	static readonly status: Status = 508;

	constructor(
		message: string = "Loop Detected",
		description?: string,
		cause?: unknown,
	) {
		super(508, message, description, cause);
	}
}

export class BandwidthLimitExceeded extends HttpError {
	static readonly status: Status = 509;

	constructor(
		message: string = "Bandwidth Limit Exceeded",
		description?: string,
		cause?: unknown,
	) {
		super(509, message, description, cause);
	}
}

export class NotExtended extends HttpError {
	static readonly status: Status = 510;

	constructor(
		message: string = "Not Extended",
		description?: string,
		cause?: unknown,
	) {
		super(510, message, description, cause);
	}
}

export class NetworkAuthenticationRequired extends HttpError {
	static readonly status: Status = 511;

	constructor(
		message: string = "Network Authentication Required",
		description?: string,
		cause?: unknown,
	) {
		super(511, message, description, cause);
	}
}

export class WebServerIsDown extends HttpError {
	static readonly status: Status = 521;

	constructor(
		message: string = "Web Server Is Down",
		description?: string,
		cause?: unknown,
	) {
		super(521, message, description, cause);
	}
}

export class ConnectionTimedOut extends HttpError {
	static readonly status: Status = 522;

	constructor(
		message: string = "Connection Timed Out",
		description?: string,
		cause?: unknown,
	) {
		super(522, message, description, cause);
	}
}

export class OriginIsUnreachable extends HttpError {
	static readonly status: Status = 523;

	constructor(
		message: string = "Origin Is Unreachable",
		description?: string,
		cause?: unknown,
	) {
		super(523, message, description, cause);
	}
}

export class SslHandshakeFailed extends HttpError {
	static readonly status: Status = 525;

	constructor(
		message: string = "SSL Handshake Failed",
		description?: string,
		cause?: unknown,
	) {
		super(525, message, description, cause);
	}
}

export class OriginDnsError extends HttpError {
	static readonly status: Status = 530;

	constructor(
		message: string = "Origin DNS Error",
		description?: string,
		cause?: unknown,
	) {
		super(530, message, description, cause);
	}
}

export class NetworkConnectTimeoutError extends HttpError {
	static readonly status: Status = 599;

	constructor(
		message: string = "Network Connect Timeout Error",
		description?: string,
		cause?: unknown,
	) {
		super(599, message, description, cause);
	}
}

export class MethodNotAllowed extends HttpError {
	constructor(method: string) {
		super(405, `Method "${method}" is not allowed`);
	}
}

export class PayloadTooLarge extends HttpError {
	constructor(maxBodySize: number) {
		super(413, `Request body exceeds the ${maxBodySize} byte limit`);
	}
}

export class UnsupportedMediaType extends HttpError {
	constructor(contentType?: string) {
		super(
			415,
			contentType
				? `Unsupported media type "${contentType}"`
				: "Unsupported Media Type",
		);
	}
}
