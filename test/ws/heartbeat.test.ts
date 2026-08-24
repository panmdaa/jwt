import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createWebSocketHeartbeat,
	WebSocketHeartbeat,
} from "../../src/ws/heartbeat";
import { CloseCode, WebSocketState } from "../../src/ws/constants";

function stubConnection() {
	const listeners = new Map<string, Set<() => void>>();
	return {
		readyState: WebSocketState.OPEN,
		on: vi.fn((event: string, fn: () => void) => {
			const set = listeners.get(event) ?? new Set();
			set.add(fn);
			listeners.set(event, set);
		}),
		off: vi.fn((event: string, fn: () => void) => {
			listeners.get(event)?.delete(fn);
		}),
		ping: vi.fn(),
		close: vi.fn(),
		terminate: vi.fn(),
		_emit: (event: string) => {
			for (const fn of [...(listeners.get(event) ?? [])]) fn();
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("WebSocketHeartbeat", () => {
	it("tracks a connection and pings it on every interval", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({
			intervalMs: 1_000,
			payload: new Uint8Array([0x68, 0x69]),
		});

		heartbeat.track(conn as never);
		expect(conn.ping).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1_000);
		expect(conn.ping).toHaveBeenCalledTimes(1);
		expect(conn.ping).toHaveBeenCalledWith(new Uint8Array([0x68, 0x69]));

		// A pong resets the pending state so the next interval pings again.
		conn._emit("pong");
		vi.advanceTimersByTime(1_000);
		expect(conn.ping).toHaveBeenCalledTimes(2);
		heartbeat.close();
	});

	it("pings with an empty payload when none is configured", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });

		heartbeat.track(conn as never);
		vi.advanceTimersByTime(1_000);

		expect(conn.ping).toHaveBeenCalledWith(new Uint8Array(0));
		heartbeat.close();
	});

	it("closes a connection that never answers its pong before the deadline", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({
			intervalMs: 1_000,
			timeoutMs: 500,
			closeCode: CloseCode.GoingAway,
			closeReason: "dead",
		});

		heartbeat.track(conn as never);
		vi.advanceTimersByTime(1_000); // ping #1, deadline = 1500
		expect(conn.close).not.toHaveBeenCalled();

		vi.advanceTimersByTime(500); // t=1500, before the next tick
		expect(conn.close).not.toHaveBeenCalled();

		vi.advanceTimersByTime(500); // t=2000: tick sees now >= deadline
		expect(conn.close).toHaveBeenCalledWith(CloseCode.GoingAway, "dead");
		heartbeat.close();
	});

	it("keeps a connection alive when a pong arrives before the deadline", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({
			intervalMs: 1_000,
			timeoutMs: 500,
		});

		heartbeat.track(conn as never);
		vi.advanceTimersByTime(1_000); // ping #1
		conn._emit("pong");
		vi.advanceTimersByTime(500);
		expect(conn.close).not.toHaveBeenCalled();

		heartbeat.close();
	});

	it("untracks closed connections instead of pinging them", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });

		heartbeat.track(conn as never);
		conn.readyState = WebSocketState.CLOSED;
		conn._emit("close");
		vi.advanceTimersByTime(2_000);

		expect(conn.ping).not.toHaveBeenCalled();
		expect(conn.off).toHaveBeenCalled();
		heartbeat.close();
	});

	it("ignores duplicate track calls for the same socket", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });

		heartbeat.track(conn as never);
		heartbeat.track(conn as never);
		vi.advanceTimersByTime(1_000);

		expect(conn.ping).toHaveBeenCalledTimes(1);
		heartbeat.close();
	});

	it("is a no-op for sockets already closed when the interval fires", () => {
		const conn = stubConnection();
		conn.readyState = WebSocketState.CLOSED;
		const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });

		heartbeat.track(conn as never);
		vi.advanceTimersByTime(1_000);

		expect(conn.ping).not.toHaveBeenCalled();
		heartbeat.close();
	});

	it("falls back to terminate() when close() throws", () => {
		const conn = stubConnection();
		conn.close = vi.fn(() => {
			throw new Error("not open");
		});
		const heartbeat = createWebSocketHeartbeat({
			intervalMs: 1_000,
			timeoutMs: 0,
		});

		heartbeat.track(conn as never);
		vi.advanceTimersByTime(1_000); // ping #1, deadline = t (immediate)

		vi.advanceTimersByTime(1_000); // t=2000: deadline exceeded -> close() throws -> terminate()
		expect(conn.terminate).toHaveBeenCalled();
		heartbeat.close();
	});

	it("close() clears the interval and untracks everything", () => {
		const conn = stubConnection();
		const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });

		heartbeat.track(conn as never);
		heartbeat.close();
		vi.advanceTimersByTime(5_000);

		expect(conn.ping).not.toHaveBeenCalled();
		expect(conn.off).toHaveBeenCalled();
	});

	it("exposes the heartbeat class for direct instantiation", () => {
		const heartbeat = new WebSocketHeartbeat({ intervalMs: 10_000 });
		expect(heartbeat).toBeInstanceOf(WebSocketHeartbeat);
		heartbeat.close();
	});
});