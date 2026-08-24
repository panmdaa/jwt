import { bench, describe } from "vitest";
import { parseCookies, parseQuery } from "../../src/http/context/utils";

const QUERY_STRING = "id=42&name=panmdaa&tag=red&tag=blue&page=2&limit=20";
const SEARCH_PARAMS = new URLSearchParams(QUERY_STRING);

const COOKIE_HEADER =
	"session=abc123; theme=dark; locale=es-AR; pref=%7B%22x%22%3A1%7D; fp=abc; ga=123";

function parseQueryLoop(
	searchParams: URLSearchParams,
): Record<string, string | string[]> {
	const out = Object.create(null) as Record<string, string | string[]>;
	for (const [key, value] of searchParams) {
		const existing = out[key];
		if (existing === undefined) out[key] = value;
		else if (Array.isArray(existing)) existing.push(value);
		else out[key] = [existing, value];
	}
	return out;
}

describe("query parsing", () => {
	bench("panmdaa parseQuery", () => {
		parseQuery(SEARCH_PARAMS);
	});

	bench("URLSearchParams + loop", () => {
		parseQueryLoop(SEARCH_PARAMS);
	});
});

describe("cookie parsing", () => {
	bench("panmdaa parseCookies", () => {
		parseCookies(COOKIE_HEADER);
	});

	bench("split/map baseline", () => {
		const out = Object.create(null) as Record<string, string>;
		for (const pair of COOKIE_HEADER.split(";")) {
			const eq = pair.indexOf("=");
			if (eq === -1) continue;
			out[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
		}
	});
});
