/**
 * Compare two timestamps with a configurable clock tolerance.
 * Useful for validating JWT claims like `exp` and `nbf` that may have small
 * clock skew due to server time differences.
 *
 * @param actual The timestamp to check (typically from JWT claim)
 * @param reference The reference timestamp to compare against (typically current time)
 * @param clockTolerance Tolerance in seconds (default: 0). A claim is considered valid if
 *                       it falls within [reference - clockTolerance, reference + clockTolerance]
 * @returns `true` if `actual` is within tolerance of `reference`, `false` otherwise
 */
export function isWithinClockTolerance(
	actual: number,
	reference: number,
	clockTolerance: number = 0,
): boolean {
	const diff = Math.abs(actual - reference);
	return diff <= clockTolerance;
}

/**
 * Check if a timestamp (e.g., `exp` claim) has passed, accounting for clock tolerance.
 *
 * @param expiration The expiration timestamp in seconds
 * @param currentTime The current time in seconds (typically from `currentTimeInSeconds()`)
 * @param clockTolerance Tolerance in seconds (default: 0)
 * @returns `true` if expired (accounting for tolerance), `false` if still valid
 */
export function isExpired(
	expiration: number,
	currentTime: number,
	clockTolerance: number = 0,
): boolean {
	return currentTime > expiration + clockTolerance;
}

/**
 * Check if a timestamp (e.g., `nbf` claim) is in the future, accounting for clock tolerance.
 *
 * @param notBefore The "not before" timestamp in seconds
 * @param currentTime The current time in seconds (typically from `currentTimeInSeconds()`)
 * @param clockTolerance Tolerance in seconds (default: 0)
 * @returns `true` if not yet valid (accounting for tolerance), `false` if valid now
 */
export function isNotYetValid(
	notBefore: number,
	currentTime: number,
	clockTolerance: number = 0,
): boolean {
	return currentTime < notBefore - clockTolerance;
}
