import type { ServerRequest } from "../server";

/**
 * Parse a Cookie header string into a key-value object.
 * Optimized to use native indexOf and avoid decodeURIComponent unless necessary.
 *
 * @param header - The raw Cookie header string.
 * @returns An object containing the parsed cookies.
 */
export function parseCookies(
	header: string | undefined,
): Record<string, string> {
	if (!header) return Object.create(null);

	const cookies = Object.create(null);
	let start = 0;
	const len = header.length;

	while (start < len) {
		// Skip leading spaces and ';'
		while (
			start < len &&
			(header.charCodeAt(start) === 32 || header.charCodeAt(start) === 59)
		) {
			start++;
		}
		if (start >= len) break;

		// Use native indexOf (significantly faster than manual charCodeAt loops for long strings)
		const eqIdx = header.indexOf("=", start);
		if (eqIdx === -1) break;

		const key = header.slice(start, eqIdx);

		const valStart = eqIdx + 1;
		let valEnd = header.indexOf(";", valStart);
		if (valEnd === -1) valEnd = len;

		let val = header.slice(valStart, valEnd);

		// Decode only if the value actually contains encoded characters
		if (val.indexOf("%") !== -1) {
			try {
				val = decodeURIComponent(val);
			} catch (_) {
				// Fallback to raw value if decoding fails (matches original behavior)
			}
		}

		cookies[key] = val;
		start = valEnd + 1;
	}

	return cookies;
}

/**
 * Parse URLSearchParams into an object, automatically handling duplicate keys
 * by grouping them into an array.
 *
 * @param searchParams - The URLSearchParams instance.
 * @returns An object with string or string[] values.
 */
export function parseQuery(
	searchParams: URLSearchParams,
): Record<string, string | string[]> {
	const query = Object.create(null);

	// Iterate ONLY once over the key-value pairs.
	// Avoids creating a Set or using getAll(), reducing loops and allocations.
	for (const [key, value] of searchParams) {
		const existing = query[key];

		if (existing === undefined) {
			query[key] = value;
		} else if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			query[key] = [existing, value];
		}
	}

	return query;
}

export function requestHost(req: ServerRequest): string {
	if ("authority" in req) return req.authority ?? "";
	return req.headers.host ?? "";
}

export function requestOrigin(req: ServerRequest): string {
	const header = req.headers.origin;

	if (header) return header;

	const protocol =
		"encrypted" in req.socket && req.socket.encrypted ? "https" : "http";

	const host =
		"authority" in req ? (req.authority ?? "") : (req.headers.host ?? "");

	return `${protocol}://${host}`;
}
