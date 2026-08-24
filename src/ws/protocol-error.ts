import { CloseCode } from "./constants";

/**
 * Signals a violation of the WebSocket framing protocol. Carries the close
 * code that should be sent to the peer when the connection is failed.
 */
export class WebSocketProtocolError extends Error {
	readonly closeCode: CloseCode;

	constructor(message: string, closeCode: CloseCode = CloseCode.ProtocolError) {
		super(message);
		this.name = "WebSocketProtocolError";
		this.closeCode = closeCode;
	}
}
