import type { Duplex } from "node:stream";

import { DEFAULT_CLOSE_TIMEOUT, DEFAULT_MAX_PAYLOAD } from "../constants";
import type { WebSocketConnectionOptions } from "../types";
import { WebSocketConnection } from "./connection";

export function createWebSocket(
	socket: Duplex,
	options: WebSocketConnectionOptions = {},
): WebSocketConnection {
	return new WebSocketConnection(socket, {
		autoPong: options.autoPong ?? true,
		closeTimeout: options.closeTimeout ?? DEFAULT_CLOSE_TIMEOUT,
		maxPayload: options.maxPayload ?? DEFAULT_MAX_PAYLOAD,
		protocol: options.protocol ?? "",
		skipUTF8Validation: options.skipUTF8Validation ?? false,
		...(options.perMessageDeflate
			? { perMessageDeflate: options.perMessageDeflate }
			: {}),
	});
}
