export function normalizePrefix(prefix: string): string {
	if (prefix === "") return "";
	if (prefix[0] !== "/") prefix = `/${prefix}`;
	if (prefix.length > 1 && prefix.endsWith("/")) prefix = prefix.slice(0, -1);
	return prefix;
}

export function joinPath(prefix: string, path: string): string {
	if (prefix === "") return path;
	if (path === "/") return prefix;
	return `${prefix}${path}`;
}
