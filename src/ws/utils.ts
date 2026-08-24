import type { RequestTransport, SizeInput } from "./types";

const SIZE_PATTERN = /^(\d+)(b|kb|mb|gb)$/i;

export function parseSize(
	value: SizeInput | undefined,
	fallback: number,
): number {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value === "number") {
		return value;
	}

	const match = SIZE_PATTERN.exec(value.trim());

	if (!match) {
		throw new TypeError(`Invalid size value "${value}"`);
	}

	const amountText = match[1];
	const unitText = match[2];

	if (!amountText || !unitText) {
		throw new TypeError(`Invalid size value "${value}"`);
	}

	const amount = Number.parseInt(amountText, 10);
	const unit = unitText.toLowerCase();

	switch (unit) {
		case "b":
			return amount;
		case "kb":
			return amount * 1024;
		case "mb":
			return amount * 1024 * 1024;
		case "gb":
			return amount * 1024 * 1024 * 1024;
		default:
			return fallback;
	}
}

export function decodeComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function toHeaderValue(name: string): string {
	return name.toLowerCase();
}

export function isArrayBufferView(value: unknown): value is ArrayBufferView {
	return ArrayBuffer.isView(value);
}

export function toBuffer(
	value: string | Uint8Array | ArrayBuffer | ArrayBufferView,
): Buffer {
	if (typeof value === "string") {
		return Buffer.from(value);
	}

	if (value instanceof Uint8Array) {
		return Buffer.from(value);
	}

	if (value instanceof ArrayBuffer) {
		return Buffer.from(value);
	}

	return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

export function inferTransport(
	httpVersionMajor: number,
	secure: boolean,
): RequestTransport {
	if (httpVersionMajor >= 2) {
		return secure ? "http2s" : "http2";
	}

	return secure ? "https" : "http";
}

export function isPromiseLike<T>(
	value: T | PromiseLike<T>,
): value is PromiseLike<T> {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}
