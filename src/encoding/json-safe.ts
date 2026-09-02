import { encodeBase64Url, decodeBase64Url } from "./base64url";

/** Characters/strings considered dangerous in object keys (prototype pollution). */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Validates that an object's keys do not contain dangerous strings that could
 * enable prototype pollution attacks.
 *
 * @param obj The object to validate
 * @throws Error if dangerous keys are detected
 */
function validateObjectKeys(obj: unknown): void {
	if (typeof obj !== "object" || obj === null) {
		return;
	}

	// Use getOwnPropertyNames to catch non-enumerable properties like __proto__
	const keys = Object.getOwnPropertyNames(obj);
	for (const key of keys) {
		if (DANGEROUS_KEYS.has(key)) {
			throw new Error(`Dangerous key "${key}" detected in object`);
		}
		// Recursively validate nested objects
		const val = (obj as Record<string, unknown>)[key];
		if (typeof val === "object" && val !== null) {
			validateObjectKeys(val);
		}
	}
}

/**
 * Serialize a plain JavaScript object to base64url JSON deterministically.
 * Validates against prototype pollution before serializing.
 *
 * @param obj The object to serialize
 * @returns Base64url-encoded JSON string
 * @throws Error if obj contains dangerous keys or is not a plain object
 */
export function serializeToBase64Url(obj: unknown): string {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
		throw new Error("Only plain objects can be serialized");
	}

	validateObjectKeys(obj);

	const json = JSON.stringify(obj);
	return encodeBase64Url(json);
}

/**
 * Deserialize a base64url-encoded JSON string to a plain object.
 *
 * @param encoded The base64url-encoded JSON string
 * @returns The deserialized object
 * @throws Error if the input is not valid base64url or if JSON parsing fails
 */
export function deserializeFromBase64Url(encoded: string): unknown {
	const buffer = decodeBase64Url(encoded);
	const json = buffer.toString("utf8");

	let obj: unknown;
	try {
		obj = JSON.parse(json);
	} catch (err) {
		throw new Error(`Failed to parse JSON from base64url payload: ${String(err)}`);
	}

	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
		throw new Error("Deserialized payload must be a plain object");
	}

	return obj;
}
