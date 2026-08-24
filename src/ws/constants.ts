/**
 * WebSocket connection states, mirroring the `readyState` values defined by
 * the WHATWG WebSocket API and RFC 6455.
 */
export enum WebSocketState {
	CONNECTING = 0,
	OPEN = 1,
	CLOSING = 2,
	CLOSED = 3,
}

/**
 * WebSocket frame opcodes (RFC 6455, section 5.2).
 */
export enum Opcode {
	Continuation = 0x0,
	Text = 0x1,
	Binary = 0x2,
	Close = 0x8,
	Ping = 0x9,
	Pong = 0xa,
}

/**
 * Close codes defined by RFC 6455 and the IANA WebSocket close code registry.
 * Codes 1004, 1005, 1006 and 1015 are reserved for protocol bookkeeping and
 * must never be sent on the wire.
 */
export enum CloseCode {
	NormalClosure = 1000,
	GoingAway = 1001,
	ProtocolError = 1002,
	UnsupportedData = 1003,
	NoStatusReceived = 1005,
	AbnormalClosure = 1006,
	InvalidFramePayloadData = 1007,
	PolicyViolation = 1008,
	MessageTooBig = 1009,
	MandatoryExtension = 1010,
	InternalServerError = 1011,
	ServiceRestart = 1012,
	TryAgainLater = 1013,
	BadGateway = 1014,
	TlsHandshake = 1015,
}

/** Close codes an endpoint is allowed to send on the wire. */
export const SENDABLE_CLOSE_CODES: ReadonlySet<CloseCode> = new Set([
	CloseCode.NormalClosure,
	CloseCode.GoingAway,
	CloseCode.ProtocolError,
	CloseCode.UnsupportedData,
	CloseCode.InvalidFramePayloadData,
	CloseCode.PolicyViolation,
	CloseCode.MessageTooBig,
	CloseCode.MandatoryExtension,
	CloseCode.InternalServerError,
]);

/** Largest payload that fits the 7-bit frame length field (RFC 6455, section 5.2). */
export const MAX_PAYLOAD_LENGTH_7BIT = 125;

/** Largest payload that fits the 16-bit frame length field. */
export const MAX_PAYLOAD_LENGTH_16BIT = 65_535;

/** Maximum payload of a single control frame (RFC 6455, section 5.5). */
export const MAX_CONTROL_PAYLOAD = 125;

/** Bytes available for a close reason after the two-byte close code. */
export const MAX_CLOSE_REASON_BYTES = 123;

/**
 * Minimum payload length at which the mask word (three-pass Uint32Array) path
 * beats the unrolled byte loop. Below this size the alignment setup overhead
 * outweighs processing four bytes at a time.
 */
export const UNMASK_LOOP_THRESHOLD = 64;

/** Default per-connection inbound payload limit (16 MiB). */
export const DEFAULT_MAX_PAYLOAD = 16 * 1024 * 1024;

/** Default grace period before a closing handshake is aborted. */
export const DEFAULT_CLOSE_TIMEOUT = 5_000;
