import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { OutgoingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { lookup, type MimeType } from "../../../generated";
import type { ServerResponseLike } from "../../server";
import type { CommonVary, HeadersKey, Status } from "./types";

/**
 * A high‑performance response context for HTTP servers.
 * Wraps a native ServerResponse (HTTP/1.x or HTTP/2) and provides
 * convenient methods for sending JSON, HTML, files, and more.
 */
export class ResponseContext {
	/** HTTP status code (default: 200). */
	status: Status = 200;

	/** Whether the response has already been committed/ended. */
	private ended = false;

	private cachedHeaders:
		| (OutgoingHttpHeaders & Record<string, string | string[]>)
		| null = null;

	/**
	 * Response headers, allocated lazily on first access so a response that
	 * never sets one doesn't pay for the object.
	 */
	get headers(): OutgoingHttpHeaders & Record<string, string | string[]> {
		if (this.cachedHeaders === null) this.cachedHeaders = {};
		return this.cachedHeaders;
	}

	/**
	 * @param native - The underlying ServerResponse-like object.
	 */
	constructor(public readonly native: ServerResponseLike) {}

	/**
	 * Commits the status and headers to the underlying response.
	 * Uses `writeHead` to set everything in one native call.
	 *
	 * The union type `ServerResponseLike` has incompatible `writeHead` signatures,
	 * so we use a type assertion to bypass the check – the call is valid at runtime.
	 */
	private commit(): void {
		(this.native as any).writeHead(this.status, this.cachedHeaders ?? {});
	}

	/**
	 * Ends the response, optionally with a body chunk.
	 * @param chunk - Optional data (string or Uint8Array) to send.
	 */
	private finish(chunk?: string | Uint8Array): void {
		if (this.ended) return;

		// Fast path: no headers and default status. Node computes
		// Content-Length and sends a single fixed-length response.
		if (this.cachedHeaders === null && this.status === 200) {
			this.ended = true;
			if (chunk !== undefined) {
				this.native.end(chunk);
			} else {
				this.native.end();
			}
			return;
		}

		// Setting Content-Length explicitly (when the size is known) lets Node
		// send a fixed-length body instead of Transfer-Encoding: chunked, which
		// is faster to produce and to parse. Only when the caller didn't set it
		// (or a Transfer-Encoding) themselves.
		if (
			chunk !== undefined &&
			this.headers["Content-Length"] === undefined &&
			this.headers["Transfer-Encoding"] === undefined
		) {
			this.headers["Content-Length"] = String(
				typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength,
			);
		}

		this.commit();
		this.ended = true;
		if (chunk !== undefined) {
			this.native.end(chunk);
		} else {
			this.native.end();
		}
	}

	/**
	 * Pipes a readable stream to the response.
	 * Headers are committed before streaming.
	 * @param readable - The source stream.
	 */
	private async pipe(readable: Readable): Promise<void> {
		if (this.ended) return;
		this.commit();
		this.ended = true;
		await pipeline(readable, this.native);
	}

	/**
	 * Get or set a header value.
	 * @param name - Header name.
	 * @param value - If provided, sets the header; otherwise gets the current value.
	 * @returns The current header value when getting, or undefined when setting.
	 */
	header(
		name: HeadersKey,
		value?: string | readonly string[],
	): OutgoingHttpHeaders[HeadersKey] {
		if (value === undefined) {
			return this.headers[name];
		}
		this.headers[name] = value as HeadersKey;
	}

	/** Remove a header. */
	removeHeader(name: HeadersKey): void {
		delete this.headers[name];
	}

	/**
	 * Set the Content-Type header with a charset.
	 * @param contentType - The MIME type (e.g., 'application/json').
	 */
	type(contentType: MimeType | (string & {})): void {
		this.headers["Content-Type"] = `${contentType}; charset=utf-8`;
	}

	vary(field: CommonVary | (string & {})): this {
		const current = this.headers.vary;

		if (!current) {
			this.header("vary", field);
			return this;
		}

		const entries = new Set(
			String(current)
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);

		entries.add(field);
		this.header("vary", [...entries].join(", "));
		return this;
	}

	/**
	 * Send a response with automatic content‑type detection.
	 * Strings are sent as text/plain, Uint8Array as octet‑stream,
	 * and everything else as JSON.
	 * @param data - The data to send.
	 */
	send(data: unknown): void {
		const ct = this.headers["Content-Type"];
		if (ct === undefined) {
			if (typeof data === "string") {
				this.headers["Content-Type"] = "text/plain; charset=utf-8";
			} else if (data instanceof Uint8Array) {
				this.headers["Content-Type"] = "application/octet-stream";
			} else {
				this.headers["Content-Type"] = "application/json; charset=utf-8";
			}
		}

		if (typeof data === "string" || data instanceof Uint8Array) {
			this.finish(data);
		} else {
			this.finish(JSON.stringify(data));
		}
	}

	/**
	 * Stream a readable to the client.
	 * @param readable - The source stream.
	 */
	async stream(readable: Readable): Promise<void> {
		await this.pipe(readable);
	}

	/** Send a JSON response. */
	json(data: object): void {
		if (this.headers["Content-Type"] === undefined) {
			this.headers["Content-Type"] = "application/json; charset=utf-8";
		}
		this.finish(JSON.stringify(data));
	}

	/** Send an HTML response. */
	html(content: string): void {
		if (this.headers["Content-Type"] === undefined) {
			this.headers["Content-Type"] = "text/html; charset=utf-8";
		}
		this.finish(content);
	}

	/** Send a plain text response. */
	text(content: string): void {
		if (this.headers["Content-Type"] === undefined) {
			this.headers["Content-Type"] = "text/plain; charset=utf-8";
		}
		this.finish(content);
	}

	/** Send a file with inline disposition. */
	async file(path: string): Promise<void> {
		await this.sendFile(path, "inline");
	}

	/** Send a file with attachment disposition (download). */
	async download(path: string, filename?: string): Promise<void> {
		await this.sendFile(path, "attachment", filename);
	}

	/**
	 * Private helper for sending files.
	 * Sets Content‑Length, Content‑Type, and Content‑Disposition if not already present.
	 */
	private async sendFile(
		path: string,
		disposition: "inline" | "attachment",
		filename?: string,
	): Promise<void> {
		const info = await stat(path);
		const name = filename ?? path.slice(path.lastIndexOf("/") + 1);
		const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();

		// Set headers only if not already defined
		if (this.headers["Content-Length"] === undefined) {
			this.headers["Content-Length"] = String(info.size);
		}
		if (this.headers["Content-Type"] === undefined) {
			const mime = lookup(ext) ?? "text/plain";
			this.headers["Content-Type"] = mime;
		}
		if (this.headers["Content-Disposition"] === undefined) {
			this.headers["Content-Disposition"] =
				`${disposition}; filename="${name}"`;
		}

		await this.pipe(createReadStream(path));
	}

	/**
	 * Redirect to a URL.
	 * @param url - The target URL.
	 * @param redirectStatus - HTTP status (default: 302).
	 */
	redirect(url: string, redirectStatus: Status = 302): void {
		this.status = redirectStatus;
		this.headers.Location = url;
		this.finish();
	}

	/** End the response without a body. */
	end(): void {
		this.finish();
	}
}
