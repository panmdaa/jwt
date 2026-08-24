import type { Duplex } from "node:stream";

import type { CloseCode } from "../constants";

export function buildClosePayload(code: CloseCode, reason: string): Buffer {
	const reasonBuffer = Buffer.from(reason);
	const payload = Buffer.allocUnsafe(2 + reasonBuffer.byteLength);
	payload.writeUInt16BE(code, 0);
	reasonBuffer.copy(payload, 2);
	return payload;
}

export function waitForDrain(socket: Duplex): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			socket.off("close", handleClose);
			socket.off("drain", handleDrain);
			socket.off("error", handleError);
		};

		const handleDrain = () => {
			cleanup();
			resolve();
		};
		const handleClose = () => {
			cleanup();
			reject(new Error("WebSocket closed before the write buffer drained"));
		};
		const handleError = (error: Error) => {
			cleanup();
			reject(error);
		};

		socket.once("drain", handleDrain);
		socket.once("close", handleClose);
		socket.once("error", handleError);
	});
}
