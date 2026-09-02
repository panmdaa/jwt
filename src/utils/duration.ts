/**
 * Parse a duration string or number into seconds.
 *
 * Supports:
 * - Plain numbers (interpreted as seconds): `60`, `3600`
 * - Duration strings:
 *   - `s` for seconds: `"30s"`
 *   - `m` for minutes: `"5m"`
 *   - `h` for hours: `"2h"`
 *   - `d` for days: `"7d"`
 *   - `w` for weeks: `"2w"`
 *   - `y` for years (365 days): `"1y"`
 *
 * @param duration A number or duration string
 * @returns Duration in seconds
 * @throws Error if the format is unrecognized
 */
export function parseDuration(duration: number | string): number {
	// Handle plain numbers
	if (typeof duration === "number") {
		if (!Number.isInteger(duration) || duration < 0) {
			throw new Error(`Invalid duration: must be a non-negative integer in seconds, got ${duration}`);
		}
		return duration;
	}

	if (typeof duration !== "string") {
		throw new Error(`Invalid duration type: expected number or string, got ${typeof duration}`);
	}

	const trimmed = duration.trim();

	// Try to parse as a plain number string
	if (/^\d+$/.test(trimmed)) {
		const num = Number(trimmed);
		return num;
	}

	// Parse duration strings like "1h", "30m", etc.
	const match = /^(\d+(?:\.\d+)?)(s|m|h|d|w|y)$/.exec(trimmed);

	if (!match) {
		throw new Error(
			`Invalid duration format: "${duration}". Expected a number or a string like "1h", "30m", "7d", etc.`,
		);
	}

	const [, valueStr, unit] = match;
	const value = Number.parseFloat(valueStr);

	if (value < 0) {
		throw new Error(`Invalid duration: value must be non-negative, got ${value}`);
	}

	// Convert to seconds based on unit
	const multipliers: Record<string, number> = {
		s: 1,
		m: 60,
		h: 60 * 60,
		d: 24 * 60 * 60,
		w: 7 * 24 * 60 * 60,
		y: 365 * 24 * 60 * 60, // Simplified: 365 days
	};

	const multiplier = multipliers[unit];
	const seconds = Math.floor(value * multiplier);

	return seconds;
}
