/**
 * Get the current time as a Unix timestamp in seconds.
 * JWT claims (`exp`, `nbf`, `iat`) use seconds, not milliseconds.
 *
 * @returns Current Unix timestamp in seconds
 */
export function currentTimeInSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
