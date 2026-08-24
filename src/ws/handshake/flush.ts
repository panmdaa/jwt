import type { Socket } from "node:net";

import type { NodeUpgradeSocket } from "../types";

const HANDSHAKE_WRITE_TIMEOUT_MS = 5_000;

/**
 * Whether the current runtime reliably flushes writes issued inside the
 * `'upgrade'` event. Defaults to `true` for runtimes without a known broken
 * `node:http` shim (Node.js and anything that is not bun). bun < 1.4.0
 * silently discards the payload and never advances `socket.bytesWritten`;
 * from 1.4.0 the bytes reach the wire, but `socket.bytesWritten` still stays
 * at 0, so the counter check must be skipped for fixed versions.
 */
export function isUpgradeFixApplied(): boolean {
	const version = process.versions.bun;
	if (!version) {
		return true;
	}

	const [major, minor] = version.split(".").map(Number);

	return major > 1 || (major === 1 && minor >= 4);
}

/**
 * Writes the HTTP/1.1 101 handshake and verifies the bytes actually reached
 * the socket. Some runtimes (e.g. bun's `node:http` shim, fixed in bun
 * 1.4.0+ / #31587) invoke the write callback as successful while silently
 * discarding the payload, leaving the client hanging forever on a connection
 * that never upgrades. When the runtime is not known to be reliable, the
 * counter check fails fast with an actionable error instead of timing out
 * silently.
 */
export async function writeHandshake(
	socket: NodeUpgradeSocket,
	response: string,
): Promise<void> {
	if (!socket.writable) {
		throw new Error("Cannot write WebSocket handshake: socket is not writable");
	}

	const bytesBefore = (socket as Socket).bytesWritten ?? 0;

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(
				new Error(
					"Timed out while flushing the WebSocket 101 handshake to the socket",
				),
			);
		}, HANDSHAKE_WRITE_TIMEOUT_MS);

		socket.write(response, (error) => {
			clearTimeout(timer);

			if (error) {
				reject(error);
				return;
			}

			const bytesAfter = (socket as Socket).bytesWritten ?? 0;
			const flushed = bytesAfter - bytesBefore >= Buffer.byteLength(response);

			if (flushed || isUpgradeFixApplied()) {
				resolve();
				return;
			}

			reject(
				new Error(
					"The WebSocket 101 handshake was silently dropped by the runtime: " +
						"the write callback reported success but no bytes reached the " +
						"socket. This happens on runtimes whose node:http shim ignores " +
						"writes inside the 'upgrade' event (known bun bug, fixed in " +
						"bun 1.4.0+ / #31587). Run the server with Node.js or upgrade " +
						"your runtime to restore WebSocket upgrades.",
				),
			);
		});
	});
}
