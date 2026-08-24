import type { ContextHttpHandler, Handler, HttpMethod } from "../http";
import { HTTP_METHODS } from "../router/constants";

export interface CorsMiddlewareOptions {
	allowCredentials?: boolean;
	allowHeaders?: readonly string[] | string;
	allowMethods?: readonly HttpMethod[] | string;
	allowOrigin?: boolean | string | readonly string[] | RegExp;
	exposeHeaders?: readonly string[] | string;
	maxAge?: number;
}

type CorsMiddleware = (
	options?: CorsMiddlewareOptions,
) => Handler<ContextHttpHandler<"/">>;

export const cors: CorsMiddleware = (options = {}) => {
	const allowMethods =
		normalizeHeaderValue(options.allowMethods) ?? HTTP_METHODS.join(", ");
	const allowHeaders = normalizeHeaderValue(options.allowHeaders);
	const exposeHeaders = normalizeHeaderValue(options.exposeHeaders);

	return ({ headers, origin, method, response }, next) => {
		const allowedOrigin = resolveAllowedOrigin(options.allowOrigin, origin);

		if (allowedOrigin) {
			response.header("access-control-allow-origin", allowedOrigin);
			response.vary("origin");
		}

		if (options.allowCredentials) {
			response.header("access-control-allow-credentials", "true");
		}

		if (allowMethods) {
			response.header("access-control-allow-methods", allowMethods);
		}

		if (exposeHeaders) {
			response.header("access-control-expose-headers", exposeHeaders);
		}

		if (options.maxAge !== undefined) {
			response.header("access-control-max-age", String(options.maxAge));
		}

		if (method === "OPTIONS" && headers["access-control-request-method"]) {
			response.header(
				"access-control-allow-headers",
				allowHeaders ?? headers["access-control-request-headers"] ?? "",
			);
			response.status = 204;
			response.end();
			return;
		}

		next();
	};
};

function normalizeHeaderValue(
	value: readonly string[] | string | undefined,
): string | undefined {
	if (value === undefined) return undefined;

	if (typeof value === "string") return value;

	return value.join(", ");
}

function resolveAllowedOrigin(
	rule: CorsMiddlewareOptions["allowOrigin"],
	origin: string | undefined,
): string | undefined {
	if (rule === false) return undefined;

	if (rule === undefined || rule === true) return origin ?? "*";

	if (typeof rule === "string") return rule;

	if (Array.isArray(rule))
		return origin && rule.includes(origin) ? origin : undefined;

	if (rule instanceof RegExp)
		return origin && rule.test(origin) ? origin : undefined;

	return undefined;
}
