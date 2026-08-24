import { PayloadTooLarge } from "../../../error";
import type { ServerRequest } from "../../server";

/**
 * Read the entire HTTP request body into a single Buffer.
 * Handles both Buffer and string chunks, preserving the original behavior.
 *
 * @param req - The ServerRequest object.
 * @param maxBodySize - Optional maximum body size in bytes. Throws
 * `PayloadTooLarge` as soon as the accumulated size exceeds it.
 * @returns A promise that resolves with the raw body Buffer.
 */
export function readRawBody(
	req: ServerRequest,
	maxBodySize?: number,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;

		// Track the total length so Buffer.concat can allocate exactly once
		// instead of re-scanning the chunk list.
		const cleanup = () => {
			// Optional chaining: some request-like objects (test mocks) only
			// implement `on`. Runs once per request, not per chunk.
			req.removeListener?.("data", onData);
			req.removeListener?.("end", onEnd);
			req.removeListener?.("error", onError);
		};

		// Re-use a single function to avoid recreating closures per chunk.
		// The check ensures we never push strings into the chunks array.
		const onData = (chunk: Buffer | string) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buffer.length;

			if (maxBodySize !== undefined && size > maxBodySize) {
				cleanup();
				reject(new PayloadTooLarge(maxBodySize));
				return;
			}

			chunks.push(buffer);
		};

		const onEnd = () => {
			cleanup();
			// Fast path: a single chunk is already the complete body.
			resolve(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size));
		};

		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		req.on("data", onData);
		req.on("end", onEnd);
		req.on("error", onError);
	});
}

/**
 * Parse an HTTP request body into a FormData object.
 * Supports application/x-www-form-urlencoded and multipart/form-data.
 *
 * @param buffer - The raw request body as a Buffer.
 * @param contentType - The Content‑Type header (required for parsing).
 * @returns A FormData object populated with fields and files.
 * @throws {TypeError} If the Content‑Type is missing or unsupported.
 */
export function parseFormData(buffer: Buffer, contentType?: string): FormData {
	if (buffer.length === 0) return new FormData();
	if (!contentType) {
		throw new TypeError("Cannot parse form data without a Content-Type header");
	}

	// Extract the media type (case‑insensitive) without allocating extra arrays.
	const semicolonIdx = contentType.indexOf(";");
	const mediaType = (
		semicolonIdx === -1 ? contentType : contentType.slice(0, semicolonIdx)
	)
		.trim()
		.toLowerCase();

	if (mediaType === "application/x-www-form-urlencoded") {
		const form = new FormData();
		const params = new URLSearchParams(buffer.toString("utf8"));
		for (const [key, value] of params) {
			form.append(key, value);
		}
		return form;
	}

	if (mediaType === "multipart/form-data") {
		const boundary = extractBoundary(contentType);
		if (!boundary) {
			throw new TypeError("Missing boundary in multipart Content-Type");
		}
		return parseMultipart(buffer, boundary);
	}

	throw new TypeError(`Unsupported form content type: ${mediaType}`);
}

/**
 * Extract the boundary parameter from a multipart Content‑Type header.
 * Manual parsing (no regex) for maximum speed.
 *
 * @param contentType - The full Content‑Type header.
 * @returns The boundary string, or undefined if not found.
 */
function extractBoundary(contentType: string): string | undefined {
	const boundaryKey = "boundary=";
	let idx = contentType.toLowerCase().indexOf(boundaryKey);
	if (idx === -1) return undefined;

	idx += boundaryKey.length;
	const start = idx;

	// Check for quoted boundary
	if (contentType[idx] === '"') {
		idx++; // skip opening quote
		const end = contentType.indexOf('"', idx);
		if (end === -1) return undefined;
		return contentType.slice(idx, end);
	}

	// Unquoted: ends at semicolon, space, or end of string
	const end = contentType.indexOf(";", idx);
	return (
		contentType.slice(start, end === -1 ? undefined : end).trim() || undefined
	);
}

/**
 * Parse a multipart/form-data body into a FormData object.
 * Highly optimized with manual parsing and precomputed delimiters.
 *
 * @param buffer - The raw body Buffer.
 * @param boundary - The boundary string from the Content‑Type.
 * @returns A populated FormData instance.
 */
function parseMultipart(buffer: Buffer, boundary: string): FormData {
	const form = new FormData();

	// Precompute delimiter buffers (we search for them repeatedly)
	const dashBoundary = `--${boundary}`;
	const crlfDashBoundary = `\r\n--${boundary}`;
	const doubleCRLF = "\r\n\r\n";

	let index = buffer.indexOf(dashBoundary);
	const delimiterLength = dashBoundary.length;

	while (index !== -1) {
		let cursor = index + delimiterLength;

		// Check for final boundary (-- at the end)
		if (
			buffer[cursor] === 0x2d && // '-'
			buffer[cursor + 1] === 0x2d // '-'
		) {
			break;
		}

		// Skip the CRLF after the boundary (if present)
		if (
			buffer[cursor] === 0x0d && // '\r'
			buffer[cursor + 1] === 0x0a // '\n'
		) {
			cursor += 2;
		}

		// Find the end of the headers section
		const headerEnd = buffer.indexOf(doubleCRLF, cursor);
		if (headerEnd === -1) break;

		// Extract and parse headers manually
		const headers = buffer.subarray(cursor, headerEnd).toString("utf8");
		const bodyStart = headerEnd + doubleCRLF.length;

		// Find the next boundary (with preceding CRLF) to locate the body end
		const next = buffer.indexOf(crlfDashBoundary, bodyStart);
		const bodyEnd = next === -1 ? buffer.length : next;

		// Extract body and trim trailing CRLF (if present)
		let rawBody = buffer.subarray(bodyStart, bodyEnd);
		if (
			rawBody.length >= 2 &&
			rawBody[rawBody.length - 2] === 0x0d &&
			rawBody[rawBody.length - 1] === 0x0a
		) {
			rawBody = rawBody.subarray(0, rawBody.length - 2);
		}

		// Parse name and filename from Content-Disposition
		const dispIdx = headers.indexOf("Content-Disposition:");
		let name: string | undefined;
		let filename: string | undefined;

		if (dispIdx !== -1) {
			const dispStart = dispIdx + "Content-Disposition:".length;
			const dispEnd = headers.indexOf("\r\n", dispStart);
			const dispLine = headers.slice(
				dispStart,
				dispEnd === -1 ? undefined : dispEnd,
			);

			// Extract name="..."
			const nameIdx = dispLine.indexOf('name="');
			if (nameIdx !== -1) {
				const nameStart = nameIdx + 6;
				const nameEnd = dispLine.indexOf('"', nameStart);
				if (nameEnd !== -1) {
					name = dispLine.slice(nameStart, nameEnd);
				}
			}

			// Extract filename="..."
			const fileIdx = dispLine.indexOf('filename="');
			if (fileIdx !== -1) {
				const fileStart = fileIdx + 10;
				const fileEnd = dispLine.indexOf('"', fileStart);
				if (fileEnd !== -1) {
					filename = dispLine.slice(fileStart, fileEnd);
				}
			}
		}

		if (name) {
			if (filename) {
				// It's a file – extract Content-Type
				let type = "application/octet-stream";
				const ctIdx = headers.indexOf("Content-Type:");
				if (ctIdx !== -1) {
					const ctStart = ctIdx + "Content-Type:".length;
					const ctEnd = headers.indexOf("\r\n", ctStart);
					const ctLine = headers
						.slice(ctStart, ctEnd === -1 ? undefined : ctEnd)
						.trim();
					if (ctLine) type = ctLine;
				}

				// Use File if available, otherwise fallback to Blob (Node.js compatibility)
				const blobPart = new Uint8Array(rawBody);
				if (typeof File !== "undefined") {
					form.append(name, new File([blobPart], filename, { type }), filename);
				} else {
					form.append(name, new Blob([blobPart], { type }), filename);
				}
			} else {
				// Plain field – decode as UTF-8 string
				form.append(name, rawBody.toString("utf8"));
			}
		}

		index = next;
	}

	return form;
}
