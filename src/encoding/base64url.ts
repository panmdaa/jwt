/**
 * Encode a Buffer, Uint8Array, or string to base64url format (RFC 4648 §5).
 * Base64url omits padding and replaces +/ with -_.
 *
 * @param input The data to encode
 * @returns Base64url-encoded string
 */
export function encodeBase64Url(input: Buffer | Uint8Array | string): string {
	const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
	return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Decode a base64url-encoded string to a Buffer.
 *
 * @param input Base64url-encoded string
 * @returns Decoded buffer
 * @throws Error if the input is not valid base64url
 */
export function decodeBase64Url(input: string): Buffer {
	// Add padding back if needed
	const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
	// Replace base64url characters with standard base64
	const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
	return Buffer.from(base64, "base64");
}
