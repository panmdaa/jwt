export const PATTERN = {
	static: /:.+?(?=\/|$)/,
	params: /:.+?(?=\/|$)/g,
	optionalParams: /(\/:\w+\?)/g,
} as const;
