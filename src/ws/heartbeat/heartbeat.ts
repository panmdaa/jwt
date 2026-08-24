import type { WebSocketConnection } from "../connection/connection";
import { CloseCode, WebSocketState } from "../constants";
import type { WebSocketHeartbeatOptions } from "../types";

interface HeartbeatState {
	awaitingPong: boolean;
	deadlineAt: number;
	onClose: () => void;
	onPong: () => void;
}

export class WebSocketHeartbeat {
	private readonly options: Required<
		Omit<WebSocketHeartbeatOptions, "payload">
	> &
		Pick<WebSocketHeartbeatOptions, "payload">;
	private readonly states = new Map<WebSocketConnection, HeartbeatState>();
	private readonly timer: NodeJS.Timeout;

	constructor(options: WebSocketHeartbeatOptions = {}) {
		this.options = {
			closeCode: options.closeCode ?? CloseCode.GoingAway,
			closeReason: options.closeReason ?? "Heartbeat timeout",
			intervalMs: options.intervalMs ?? 30_000,
			timeoutMs: options.timeoutMs ?? 10_000,
			...(options.payload === undefined ? {} : { payload: options.payload }),
		};

		this.timer = setInterval(() => {
			this.tick();
		}, this.options.intervalMs);
		this.timer.unref();
	}

	track(socket: WebSocketConnection): void {
		if (this.states.has(socket)) {
			return;
		}

		const onPong = () => {
			const state = this.states.get(socket);

			if (state) {
				state.awaitingPong = false;
			}
		};
		const onClose = () => {
			this.untrack(socket);
		};

		socket.on("pong", onPong);
		socket.on("close", onClose);
		this.states.set(socket, {
			awaitingPong: false,
			deadlineAt: 0,
			onClose,
			onPong,
		});
	}

	untrack(socket: WebSocketConnection): void {
		const state = this.states.get(socket);

		if (!state) {
			return;
		}

		socket.off("pong", state.onPong);
		socket.off("close", state.onClose);
		this.states.delete(socket);
	}

	close(): void {
		clearInterval(this.timer);

		for (const socket of Array.from(this.states.keys())) {
			this.untrack(socket);
		}
	}

	private tick(): void {
		const now = Date.now();

		for (const [socket, state] of this.states) {
			if (socket.readyState !== WebSocketState.OPEN) {
				this.untrack(socket);
				continue;
			}

			if (state.awaitingPong) {
				if (now >= state.deadlineAt) {
					this.untrack(socket);

					if (socket.readyState === WebSocketState.OPEN) {
						try {
							socket.close(this.options.closeCode, this.options.closeReason);
						} catch {
							socket.terminate();
						}
					}

					continue;
				}

				continue;
			}

			state.awaitingPong = true;
			state.deadlineAt = now + this.options.timeoutMs;

			try {
				socket.ping(this.options.payload ?? new Uint8Array(0));
			} catch {
				this.untrack(socket);
			}
		}
	}
}

export function createWebSocketHeartbeat(
	options: WebSocketHeartbeatOptions = {},
): WebSocketHeartbeat {
	return new WebSocketHeartbeat(options);
}
