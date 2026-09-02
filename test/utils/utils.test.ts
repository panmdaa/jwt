import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	currentTimeInSeconds,
	parseDuration,
	isWithinClockTolerance,
	isExpired,
	isNotYetValid,
} from "../../src/utils";

describe("currentTimeInSeconds", () => {
	it("returns the current time as a Unix timestamp in seconds", () => {
		const before = Math.floor(Date.now() / 1000);
		const result = currentTimeInSeconds();
		const after = Math.floor(Date.now() / 1000);

		expect(result).toBeGreaterThanOrEqual(before);
		expect(result).toBeLessThanOrEqual(after);
	});

	it("returns an integer", () => {
		const result = currentTimeInSeconds();
		expect(Number.isInteger(result)).toBe(true);
	});
});

describe("parseDuration", () => {
	describe("plain numbers", () => {
		it("parses a plain number as seconds", () => {
			expect(parseDuration(60)).toBe(60);
			expect(parseDuration(3600)).toBe(3600);
			expect(parseDuration(0)).toBe(0);
		});

		it("parses numeric strings as seconds", () => {
			expect(parseDuration("60")).toBe(60);
			expect(parseDuration("3600")).toBe(3600);
			expect(parseDuration("0")).toBe(0);
		});

		it("rejects negative numbers", () => {
			expect(() => parseDuration(-1)).toThrow();
			expect(() => parseDuration("-60")).toThrow();
		});

		it("rejects non-integer numbers", () => {
			expect(() => parseDuration(1.5)).toThrow();
		});
	});

	describe("seconds (s)", () => {
		it("parses seconds", () => {
			expect(parseDuration("30s")).toBe(30);
			expect(parseDuration("1s")).toBe(1);
			expect(parseDuration("0s")).toBe(0);
		});
	});

	describe("minutes (m)", () => {
		it("parses minutes", () => {
			expect(parseDuration("1m")).toBe(60);
			expect(parseDuration("5m")).toBe(300);
			expect(parseDuration("60m")).toBe(3600);
		});
	});

	describe("hours (h)", () => {
		it("parses hours", () => {
			expect(parseDuration("1h")).toBe(3600);
			expect(parseDuration("2h")).toBe(7200);
			expect(parseDuration("24h")).toBe(86400);
		});
	});

	describe("days (d)", () => {
		it("parses days", () => {
			expect(parseDuration("1d")).toBe(86400);
			expect(parseDuration("7d")).toBe(604800);
			expect(parseDuration("30d")).toBe(2592000);
		});
	});

	describe("weeks (w)", () => {
		it("parses weeks", () => {
			expect(parseDuration("1w")).toBe(604800); // 7 * 24 * 60 * 60
			expect(parseDuration("2w")).toBe(1209600);
		});
	});

	describe("years (y)", () => {
		it("parses years (365 days)", () => {
			expect(parseDuration("1y")).toBe(365 * 24 * 60 * 60);
			expect(parseDuration("2y")).toBe(2 * 365 * 24 * 60 * 60);
		});
	});

	describe("floating point durations", () => {
		it("parses floating point values and floors them", () => {
			expect(parseDuration("1.5h")).toBe(Math.floor(1.5 * 3600)); // 5400
			expect(parseDuration("0.5d")).toBe(Math.floor(0.5 * 86400)); // 43200
		});
	});

	describe("invalid formats", () => {
		it("rejects unknown units", () => {
			expect(() => parseDuration("1x")).toThrow();
			expect(() => parseDuration("5ms")).toThrow();
		});

		it("rejects malformed strings", () => {
			expect(() => parseDuration("abc")).toThrow();
			expect(() => parseDuration("1 h")).toThrow(); // space not allowed
			expect(() => parseDuration("h1")).toThrow(); // unit before value
		});

		it("rejects null, undefined, and non-string/number types", () => {
			expect(() => parseDuration(null as any)).toThrow();
			expect(() => parseDuration(undefined as any)).toThrow();
			expect(() => parseDuration({} as any)).toThrow();
		});

		it("provides descriptive error messages", () => {
			expect(() => parseDuration("invalid")).toThrow(/Invalid duration format/);
			expect(() => parseDuration(-5)).toThrow(/non-negative/);
		});
	});

	describe("edge cases", () => {
		it("handles whitespace around input", () => {
			expect(parseDuration("  1h  ")).toBe(3600);
			expect(parseDuration("\t30m\n")).toBe(1800);
		});

		it("handles very large values", () => {
			const large = parseDuration("100y");
			expect(large).toBeGreaterThan(0);
			expect(large).toBe(100 * 365 * 24 * 60 * 60);
		});
	});
});

describe("clock tolerance utilities", () => {
	describe("isWithinClockTolerance", () => {
		it("returns true when timestamps match exactly", () => {
			expect(isWithinClockTolerance(100, 100, 0)).toBe(true);
		});

		it("returns true when difference is within tolerance", () => {
			expect(isWithinClockTolerance(105, 100, 10)).toBe(true);
			expect(isWithinClockTolerance(95, 100, 10)).toBe(true);
			expect(isWithinClockTolerance(110, 100, 10)).toBe(true);
		});

		it("returns false when difference exceeds tolerance", () => {
			expect(isWithinClockTolerance(120, 100, 10)).toBe(false);
			expect(isWithinClockTolerance(80, 100, 10)).toBe(false);
		});

		it("defaults to zero tolerance", () => {
			expect(isWithinClockTolerance(100, 100)).toBe(true);
			expect(isWithinClockTolerance(101, 100)).toBe(false);
		});
	});

	describe("isExpired", () => {
		it("returns false when expiration is in the future", () => {
			const now = 100;
			const expiration = now + 1000;
			expect(isExpired(expiration, now, 0)).toBe(false);
		});

		it("returns true when expiration is in the past", () => {
			const now = 100;
			const expiration = now - 1000;
			expect(isExpired(expiration, now, 0)).toBe(true);
		});

		it("returns false when expiration equals current time (boundary)", () => {
			const now = 100;
			expect(isExpired(now, now, 0)).toBe(false);
		});

		it("accounts for clock tolerance", () => {
			const now = 100;
			const expiration = now - 5; // 5 seconds ago
			expect(isExpired(expiration, now, 0)).toBe(true);
			expect(isExpired(expiration, now, 10)).toBe(false); // Forgive within 10s
		});
	});

	describe("isNotYetValid", () => {
		it("returns false when nbf is in the past", () => {
			const now = 100;
			const nbf = now - 1000;
			expect(isNotYetValid(nbf, now, 0)).toBe(false);
		});

		it("returns true when nbf is in the future", () => {
			const now = 100;
			const nbf = now + 1000;
			expect(isNotYetValid(nbf, now, 0)).toBe(true);
		});

		it("returns false when nbf equals current time (boundary)", () => {
			const now = 100;
			expect(isNotYetValid(now, now, 0)).toBe(false);
		});

		it("accounts for clock tolerance", () => {
			const now = 100;
			const nbf = now + 5; // 5 seconds in the future
			expect(isNotYetValid(nbf, now, 0)).toBe(true);
			expect(isNotYetValid(nbf, now, 10)).toBe(false); // Forgive within 10s
		});
	});
});
