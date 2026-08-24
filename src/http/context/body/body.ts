import { Readable } from "node:stream";
import type { ServerRequest } from "../../server";
import { parseFormData, readRawBody } from "./utils";

// Methods that never carry a body per HTTP semantics. Reading them would
// hang waiting for a stream that can never arrive.
const NO_BODY_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

export class BodyContext<Body = Record<string, unknown>> {
	private cachedRaw: Buffer | null = null;
	private cachedJson: Body | null = null;
	private cachedText: string | null = null;
	private cachedArrayBuffer: ArrayBuffer | null = null;
	private cachedFormData: FormData | null = null;
	private cachedStream: ReadableStream<Uint8Array> | null = null;

	constructor(
		private readonly request: ServerRequest,
		private readonly contentType: string,
		private readonly maxBodySize?: number,
	) {}

	async raw() {
		if (this.cachedRaw !== null) return this.cachedRaw;

		// A request without a body has no stream to read: short-circuit so
		// GET/HEAD/OPTIONS/TRACE handlers don't wait on `data`/`end` events.
		if (NO_BODY_METHODS.has(this.request.method ?? "GET")) {
			this.cachedRaw = Buffer.alloc(0);
			return this.cachedRaw;
		}

		this.cachedRaw = await readRawBody(this.request, this.maxBodySize);
		return this.cachedRaw;
	}

	async json(): Promise<Body> {
		if (this.cachedJson !== null) return this.cachedJson;

		// Reuse the text representation if it was already decoded, avoiding a
		// second Buffer->string conversion.
		let text = this.cachedText;
		if (text === null) {
			const buffer = await this.raw();
			text = buffer.toString("utf8");
			this.cachedText = text;
		}

		const json: Body = text.length === 0 ? ({} as Body) : JSON.parse(text);
		this.cachedJson = json;
		return json;
	}

	async text(): Promise<string> {
		if (this.cachedText !== null) return this.cachedText;

		const buffer = await this.raw();
		this.cachedText = buffer.toString("utf8");
		return this.cachedText;
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		if (this.cachedArrayBuffer !== null) return this.cachedArrayBuffer;

		const buffer = await this.raw();
		this.cachedArrayBuffer = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		) as ArrayBuffer;
		return this.cachedArrayBuffer;
	}

	async formData(): Promise<FormData> {
		if (this.cachedFormData !== null) return this.cachedFormData;

		const buffer = await this.raw();
		this.cachedFormData = parseFormData(buffer, this.contentType);
		return this.cachedFormData;
	}

	async stream(): Promise<ReadableStream<Uint8Array>> {
		if (this.cachedStream !== null) return this.cachedStream;

		const buffer = await this.raw();
		this.cachedStream = Readable.toWeb(
			Readable.from(buffer),
		) as ReadableStream<Uint8Array>;
		return this.cachedStream;
	}
}
