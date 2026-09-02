import type { Algorithm } from "../algorithms";
import { MalformedToken } from "../error/errors";
import { verify, type JwtVerificationKey } from "../jwt/verify";
import type { JwtContext, JwtNext, JwtTokenSource } from "./types";

export const JWT_CONTEXT_STATE_KEY = Symbol("panmdaa.jwt.payload");

export interface JwtAuthOptions {
	key: JwtVerificationKey;
	algorithms: Algorithm[];
	tokenSource?: JwtTokenSource;
	headerName?: string;
	headerPrefix?: string;
	cookieName?: string;
	issuer?: string;
	audience?: string | string[];
	subject?: string;
	clockTolerance?: number;
	maxTokenLength?: number;
	stateKey?: symbol;
}

function getHeaderValue(context: JwtContext, name: string): string | undefined {
	if (context.headers && typeof context.headers.get === "function") {
		return context.headers.get(name) ?? context.headers.get(name.toLowerCase()) ?? undefined;
	}
	if (context.headers && typeof context.headers === "object") {
		const direct = context.headers[name] ?? context.headers[name.toLowerCase()];
		return typeof direct === "string" ? direct : undefined;
	}
	return undefined;
}

function getCookieValue(context: JwtContext, name: string): string | undefined {
	if (context.cookies && typeof context.cookies.get === "function") {
		return context.cookies.get(name) ?? undefined;
	}
	if (context.cookies && typeof context.cookies === "object") {
		const direct = context.cookies[name];
		return typeof direct === "string" ? direct : undefined;
	}
	return undefined;
}

function extractToken(context: JwtContext, options: JwtAuthOptions): string | undefined {
	const source = options.tokenSource ?? "authorization";
	if (source === "cookie") {
		const cookieName = options.cookieName ?? "jwt";
		return getCookieValue(context, cookieName);
	}

	const headerName = options.headerName ?? "Authorization";
	const headerPrefix = options.headerPrefix ?? "Bearer ";
	const headerValue = getHeaderValue(context, headerName);
	if (!headerValue) {
		return undefined;
	}
	if (headerValue.startsWith(headerPrefix)) {
		return headerValue.slice(headerPrefix.length).trim();
	}
	return headerValue.trim();
}

/**
 * Create a framework-agnostic JWT auth middleware.
 *
 * On successful verification, the payload is attached to the request state under
 * the exported `JWT_CONTEXT_STATE_KEY` symbol.
 */
export function jwtAuth<State extends Record<string, unknown> = Record<string, unknown>>(
	options: JwtAuthOptions,
): (context: JwtContext<State>, next: JwtNext) => Promise<unknown> | unknown {
	const stateKey = options.stateKey ?? JWT_CONTEXT_STATE_KEY;

	return async function middleware(context: JwtContext<State>, next: JwtNext) {
		const token = extractToken(context, options);
		if (!token) {
			throw new MalformedToken("Missing JWT token", "No token was found in the configured auth source");
		}

		const payload = verify(token, options.key, {
			algorithms: options.algorithms,
			issuer: options.issuer,
			audience: options.audience,
			subject: options.subject,
			clockTolerance: options.clockTolerance,
			maxTokenLength: options.maxTokenLength,
		});

		const nextState = {
			...(context.state ?? {}),
			[stateKey]: payload,
		} as State;
		context.state = nextState;

		return await next();
	};
}
