import type { ContextHttpHandler, Handler } from "../http";

export interface SecurityHeadersMiddlewareOptions {
	contentSecurityPolicy?: false | string;
	crossOriginOpenerPolicy?: false | string;
	dnsPrefetchControl?: boolean;
	frameOptions?: false | "DENY" | "SAMEORIGIN";
	referrerPolicy?: false | string;
	xContentTypeOptions?: boolean;
}

type SecurityHeadersMiddleware = (
	options?: SecurityHeadersMiddlewareOptions,
) => Handler<ContextHttpHandler<"/">>;

export const securityHeaders: SecurityHeadersMiddleware = (options = {}) => {
	const contentSecurityPolicy =
		options.contentSecurityPolicy ??
		"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'";
	const crossOriginOpenerPolicy =
		options.crossOriginOpenerPolicy ?? "same-origin";
	const dnsPrefetchControl = options.dnsPrefetchControl ?? false;
	const frameOptions = options.frameOptions ?? "SAMEORIGIN";
	const referrerPolicy =
		options.referrerPolicy ?? "strict-origin-when-cross-origin";
	const xContentTypeOptions = options.xContentTypeOptions ?? true;

	return ({ response }, next) => {
		response.header(
			"x-dns-prefetch-control",
			dnsPrefetchControl ? "on" : "off",
		);

		if (contentSecurityPolicy)
			response.header("content-security-policy", contentSecurityPolicy);

		if (crossOriginOpenerPolicy)
			response.header("cross-origin-opener-policy", crossOriginOpenerPolicy);

		if (frameOptions) response.header("x-frame-options", frameOptions);

		if (referrerPolicy) response.header("referrer-policy", referrerPolicy);

		if (xContentTypeOptions)
			response.header("x-content-type-options", "nosniff");

		next();
	};
};
