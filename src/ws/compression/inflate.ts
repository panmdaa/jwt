import { constants, inflateRawSync } from "node:zlib";

import { CloseCode } from "../constants";
import { WebSocketProtocolError } from "../protocol-error";
import { SYNC_FLUSH_TRAILER } from "./permessage-deflate";

export function decompressMessage(payload: Buffer): Buffer {
	try {
		const complete = Buffer.allocUnsafe(
			payload.byteLength + SYNC_FLUSH_TRAILER.byteLength,
		);
		payload.copy(complete, 0);
		SYNC_FLUSH_TRAILER.copy(complete, payload.byteLength);

		return inflateRawSync(complete, {
			finishFlush: constants.Z_SYNC_FLUSH,
		});
	} catch {
		throw new WebSocketProtocolError(
			"Invalid permessage-deflate payload",
			CloseCode.InvalidFramePayloadData,
		);
	}
}
