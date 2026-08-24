import { isUtf8 } from "node:buffer";
import type { Duplex } from "node:stream";
import { decompressMessage } from "../compression/inflate";
import { PerMessageDeflateCompressor } from "../compression/permessage-deflate";
import {
	CloseCode,
	MAX_CLOSE_REASON_BYTES,
	MAX_CONTROL_PAYLOAD,
	Opcode,
	WebSocketState,
} from "../constants";
import {
	buildFrame,
	buildFrameHeader,
	isValidCloseCode,
	type ParsedFrame,
	parseFrameInto,
} from "../frame";
import { WebSocketProtocolError } from "../protocol-error";
import { TypedEventEmitter } from "../typed-emitter";
import type {
	NormalizedWebSocketConnectionOptions,
	WebSocketCloseEvent,
	WebSocketEvents,
} from "../types";
import { toBuffer } from "../utils";
import { buildClosePayload, waitForDrain } from "./helpers";

interface PendingCompressedFrame {
	opcode: Opcode;
	payload: Buffer;
}

function toWritableView(
	value: Uint8Array | ArrayBuffer | ArrayBufferView,
): Uint8Array {
	if (value instanceof Uint8Array) {
		return value;
	}

	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}

	return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

const EMPTY_EXTENSIONS = Object.freeze({});
const PERMESSAGE_DEFLATE_EXTENSIONS = Object.freeze({
	permessageDeflate: true,
});

export class WebSocketConnection extends TypedEventEmitter<WebSocketEvents> {
	private buffer: Buffer = Buffer.alloc(0);
	private closeCode = CloseCode.NoStatusReceived;
	private closeReason = "";
	private closeTimer: NodeJS.Timeout | undefined;
	private compressedQueue: PendingCompressedFrame[] = [];
	private compressedQueueIndex = 0;
	private readonly frame: ParsedFrame = {
		fin: false,
		opcode: 0,
		payload: Buffer.alloc(0),
		rsv1: false,
	};
	private fragmentedCompressed = false;
	private fragmentedLength = 0;
	private fragmentedOpcode: Opcode | undefined;
	private fragments: Buffer[] = [];
	private flushingCompressedQueue = false;
	private hasReceivedCloseFrame = false;
	private hasReportedClose = false;
	private hasSentCloseFrame = false;
	private readonly maxPayload: number;
	private pendingCloseFrame: Buffer | undefined;
	private paused = false;
	private readyStateValue = WebSocketState.OPEN;
	private readonly compressor: PerMessageDeflateCompressor | undefined;

	readonly protocol: string;
	readonly raw: Duplex;

	constructor(
		socket: Duplex,
		private readonly options: NormalizedWebSocketConnectionOptions,
	) {
		super();
		this.raw = socket;
		this.protocol = options.protocol;
		this.maxPayload = options.maxPayload;
		this.compressor = options.perMessageDeflate
			? new PerMessageDeflateCompressor(options.perMessageDeflate)
			: undefined;

		if ("setNoDelay" in socket && typeof socket.setNoDelay === "function") {
			socket.setNoDelay(true);
		}

		socket.on("data", (chunk: Buffer) => {
			this.handleChunk(chunk);
		});
		socket.on("drain", () => {
			this.emit("drain");
		});
		socket.on("error", (error) => {
			this.emitError(error);
		});
		socket.on("close", () => {
			this.handleClose();
		});
		socket.on("end", () => {
			if (this.readyStateValue < WebSocketState.CLOSING) {
				this.readyStateValue = WebSocketState.CLOSING;
			}

			this.handleClose();
		});
	}

	get bufferedAmount(): number {
		return this.raw.writableLength;
	}

	get readyState(): WebSocketState {
		return this.readyStateValue;
	}

	get extensions(): Readonly<Record<string, true>> {
		return this.options.perMessageDeflate
			? PERMESSAGE_DEFLATE_EXTENSIONS
			: EMPTY_EXTENSIONS;
	}

	get isPaused(): boolean {
		return this.paused;
	}

	send(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): void {
		this.assertOpen();

		if (typeof data === "string") {
			if (!this.options.perMessageDeflate) {
				this.writeTextFrame(data);
				return;
			}

			this.writeFrame(Opcode.Text, Buffer.from(data));
			return;
		}

		this.writeFrame(Opcode.Binary, toWritableView(data));
	}

	sendText(data: string): void {
		this.send(data);
	}

	sendBinary(data: Uint8Array | ArrayBuffer | ArrayBufferView): void {
		this.assertOpen();
		this.writeFrame(Opcode.Binary, toWritableView(data));
	}

	ping(
		data: string | Uint8Array | ArrayBuffer | ArrayBufferView = new Uint8Array(
			0,
		),
	): void {
		this.assertOpen();
		const payload = toBuffer(data);

		if (payload.byteLength > MAX_CONTROL_PAYLOAD) {
			throw new RangeError("Ping payloads must be 125 bytes or smaller");
		}

		this.writeFrame(Opcode.Ping, payload);
	}

	pong(
		data: string | Uint8Array | ArrayBuffer | ArrayBufferView = new Uint8Array(
			0,
		),
	): void {
		this.assertOpen();
		const payload = toBuffer(data);

		if (payload.byteLength > MAX_CONTROL_PAYLOAD) {
			throw new RangeError("Pong payloads must be 125 bytes or smaller");
		}

		this.writeFrame(Opcode.Pong, payload);
	}

	close(code: CloseCode = CloseCode.NormalClosure, reason = ""): void {
		if (this.readyStateValue >= WebSocketState.CLOSING) {
			return;
		}

		if (!isValidCloseCode(code)) {
			throw new RangeError(`Invalid close code "${code}"`);
		}

		const reasonBuffer = Buffer.from(reason);

		if (reasonBuffer.byteLength > MAX_CLOSE_REASON_BYTES) {
			throw new RangeError("Close reason must be 123 bytes or smaller");
		}

		this.closeCode = code;
		this.closeReason = reason;
		this.readyStateValue = WebSocketState.CLOSING;

		const payload = buildClosePayload(code, reason);
		const frame = buildFrame(Opcode.Close, payload);

		if (this.hasPendingCompressedFrames()) {
			this.pendingCloseFrame = frame;
			void this.flushCompressedQueue();
			return;
		}

		this.writeCloseFrame(frame);
	}

	terminate(): void {
		this.compressor?.close();
		this.compressedQueue = [];
		this.compressedQueueIndex = 0;
		this.pendingCloseFrame = undefined;
		this.paused = false;
		this.readyStateValue = WebSocketState.CLOSED;
		this.raw.destroy();
	}

	pause(): void {
		if (
			this.readyStateValue === WebSocketState.CLOSED ||
			this.readyStateValue === WebSocketState.CONNECTING
		) {
			return;
		}

		if ("pause" in this.raw && typeof this.raw.pause === "function") {
			this.raw.pause();
		}

		this.paused = true;
	}

	resume(): void {
		if (
			this.readyStateValue === WebSocketState.CLOSED ||
			this.readyStateValue === WebSocketState.CONNECTING
		) {
			return;
		}

		if ("resume" in this.raw && typeof this.raw.resume === "function") {
			this.raw.resume();
		}

		this.paused = false;
	}

	private assertOpen(): void {
		if (this.readyStateValue !== WebSocketState.OPEN) {
			throw new Error("WebSocket is not open");
		}
	}

	private fail(error: WebSocketProtocolError): void {
		this.emitError(error);

		if (
			!this.hasSentCloseFrame &&
			this.readyStateValue < WebSocketState.CLOSING
		) {
			this.readyStateValue = WebSocketState.CLOSING;
			this.hasSentCloseFrame = true;
			this.raw.write(
				buildFrame(
					Opcode.Close,
					buildClosePayload(error.closeCode, error.message),
				),
			);
		}

		this.raw.destroy();
	}

	private handleChunk(chunk: Buffer): void {
		this.buffer =
			this.buffer.byteLength === 0
				? (chunk as Buffer)
				: Buffer.concat([this.buffer, chunk]);

		try {
			while (this.buffer.byteLength > 0) {
				const consumed = parseFrameInto(this.buffer, this.frame, {
					allowRsv1: this.options.perMessageDeflate !== undefined,
				});

				if (consumed === null) {
					return;
				}

				this.buffer = this.buffer.subarray(consumed);
				this.handleFrame(this.frame);
			}
		} catch (error) {
			if (error instanceof WebSocketProtocolError) {
				this.fail(error);
				return;
			}

			this.emitError(error as Error);
			this.raw.destroy();
		}
	}

	private handleFrame(frame: {
		fin: boolean;
		opcode: Opcode;
		payload: Buffer;
		rsv1: boolean;
	}): void {
		switch (frame.opcode) {
			case Opcode.Continuation:
				this.handleContinuation(frame);
				return;
			case Opcode.Text:
			case Opcode.Binary:
				this.handleDataFrame(frame);
				return;
			case Opcode.Ping:
				this.emit("ping", frame.payload);

				if (
					this.options.autoPong &&
					this.readyStateValue === WebSocketState.OPEN
				) {
					this.writeFrame(Opcode.Pong, frame.payload);
				}
				return;
			case Opcode.Pong:
				this.emit("pong", frame.payload);
				return;
			case Opcode.Close:
				this.handleCloseFrame(frame.payload);
				return;
			default:
				throw new WebSocketProtocolError(
					`Unsupported opcode "${frame.opcode}"`,
				);
		}
	}

	private handleContinuation(frame: {
		fin: boolean;
		payload: Buffer;
		rsv1: boolean;
	}): void {
		if (this.fragmentedOpcode === undefined) {
			throw new WebSocketProtocolError("Unexpected continuation frame");
		}

		if (frame.rsv1) {
			throw new WebSocketProtocolError(
				"Continuation frames must not enable RSV1",
			);
		}

		this.fragmentedLength += frame.payload.byteLength;
		this.ensurePayloadLimit(this.fragmentedLength);
		this.fragments.push(frame.payload);

		if (!frame.fin) {
			return;
		}

		const payload = Buffer.concat(this.fragments, this.fragmentedLength);
		const opcode = this.fragmentedOpcode;
		const compressed = this.fragmentedCompressed;
		this.fragments = [];
		this.fragmentedCompressed = false;
		this.fragmentedLength = 0;
		this.fragmentedOpcode = undefined;
		this.emitMessage(opcode, payload, compressed);
	}

	private handleDataFrame(frame: {
		fin: boolean;
		opcode: Opcode;
		payload: Buffer;
		rsv1: boolean;
	}): void {
		this.ensurePayloadLimit(frame.payload.byteLength);

		if (this.fragmentedOpcode !== undefined) {
			throw new WebSocketProtocolError(
				"A fragmented message is already in progress",
			);
		}

		if (!frame.fin) {
			this.fragmentedOpcode = frame.opcode;
			this.fragmentedCompressed = frame.rsv1;
			this.fragmentedLength = frame.payload.byteLength;
			this.fragments = [frame.payload];
			return;
		}

		this.emitMessage(frame.opcode, frame.payload, frame.rsv1);
	}

	private emitMessage(
		opcode: Opcode,
		payload: Buffer,
		compressed: boolean,
	): void {
		const message = compressed ? this.inflateMessage(payload) : payload;

		if (opcode === Opcode.Text) {
			if (!this.options.skipUTF8Validation && !isUtf8(message)) {
				throw new WebSocketProtocolError(
					"Received invalid UTF-8 data",
					CloseCode.InvalidFramePayloadData,
				);
			}

			const text = message.toString("utf8");

			if (this.listenerCount("message") > 0) {
				this.emit("message", { data: text, isBinary: false });
			}

			if (this.listenerCount("text") > 0) {
				this.emit("text", text);
			}

			return;
		}

		if (this.listenerCount("message") > 0) {
			this.emit("message", { data: message, isBinary: true });
		}

		if (this.listenerCount("binary") > 0) {
			this.emit("binary", message);
		}
	}

	private handleCloseFrame(payload: Buffer): void {
		this.hasReceivedCloseFrame = true;

		if (payload.byteLength === 1) {
			throw new WebSocketProtocolError(
				"Close frames must be empty or include a two-byte close code",
			);
		}

		if (payload.byteLength >= 2) {
			const code = payload.readUInt16BE(0);

			if (!isValidCloseCode(code)) {
				throw new WebSocketProtocolError("Invalid close code");
			}

			const reasonBuffer = payload.subarray(2);

			if (
				reasonBuffer.byteLength > 0 &&
				!this.options.skipUTF8Validation &&
				!isUtf8(reasonBuffer)
			) {
				throw new WebSocketProtocolError(
					"Close reason must be valid UTF-8",
					CloseCode.InvalidFramePayloadData,
				);
			}

			this.closeCode = code;
			this.closeReason = reasonBuffer.toString("utf8");
		}

		if (!this.hasSentCloseFrame) {
			this.pendingCloseFrame = undefined;
			this.hasSentCloseFrame = true;
			this.raw.write(
				buildFrame(
					Opcode.Close,
					payload.byteLength === 0
						? buildClosePayload(CloseCode.NormalClosure, "")
						: payload,
				),
			);
		}

		this.readyStateValue = WebSocketState.CLOSING;
		this.raw.end();
	}

	private handleClose(): void {
		if (this.hasReportedClose) {
			return;
		}

		this.hasReportedClose = true;

		if (this.closeTimer) {
			clearTimeout(this.closeTimer);
			this.closeTimer = undefined;
		}

		if (this.readyStateValue !== WebSocketState.CLOSED) {
			this.readyStateValue = WebSocketState.CLOSED;
		}

		this.compressedQueue = [];
		this.compressedQueueIndex = 0;
		this.compressor?.close();
		this.pendingCloseFrame = undefined;
		this.paused = false;

		const event: WebSocketCloseEvent = {
			code: this.closeCode,
			reason: this.closeReason,
			wasClean: this.hasReceivedCloseFrame || this.hasSentCloseFrame,
		};

		this.emit("close", event);
	}

	private ensurePayloadLimit(length: number): void {
		if (length > this.maxPayload) {
			throw new WebSocketProtocolError(
				"Message exceeds the configured max payload",
				CloseCode.MessageTooBig,
			);
		}
	}

	private writeFrame(opcode: Opcode, payload: Uint8Array): void {
		if (
			this.options.perMessageDeflate &&
			(opcode === Opcode.Text || opcode === Opcode.Binary)
		) {
			this.enqueueCompressedFrame(opcode, Buffer.from(payload));
			return;
		}

		if (opcode === Opcode.Text || opcode === Opcode.Binary) {
			this.writeDataFrame(opcode, payload, false);
			return;
		}

		this.raw.write(buildFrame(opcode, Buffer.from(payload)));
	}

	private inflateMessage(payload: Buffer): Buffer {
		if (!this.options.perMessageDeflate) {
			throw new WebSocketProtocolError(
				"Compressed messages require permessage-deflate support",
			);
		}

		const message = decompressMessage(payload);
		this.ensurePayloadLimit(message.byteLength);
		return message;
	}

	private emitError(error: Error): void {
		if (this.listenerCount("error") > 0) {
			this.emit("error", error);
		}
	}

	private writeDataFrame(
		opcode: Opcode,
		payload: Uint8Array,
		compressed: boolean,
	): boolean {
		const header = buildFrameHeader(opcode, payload.byteLength, {
			rsv1: compressed,
		});

		if ("cork" in this.raw && typeof this.raw.cork === "function") {
			this.raw.cork();
			this.raw.write(header);
			const wrote = this.raw.write(payload);
			this.raw.uncork();
			return wrote;
		}

		return this.raw.write(
			buildFrame(opcode, Buffer.from(payload), { rsv1: compressed }),
		);
	}

	private writeTextFrame(payload: string): void {
		const length = Buffer.byteLength(payload);
		const header = buildFrameHeader(Opcode.Text, length);

		if ("cork" in this.raw && typeof this.raw.cork === "function") {
			this.raw.cork();
			this.raw.write(header);
			this.raw.write(payload);
			this.raw.uncork();
			return;
		}

		this.raw.write(buildFrame(Opcode.Text, Buffer.from(payload)));
	}

	private enqueueCompressedFrame(opcode: Opcode, payload: Buffer): void {
		this.compressedQueue.push({ opcode, payload });
		void this.flushCompressedQueue();
	}

	private async flushCompressedQueue(): Promise<void> {
		if (this.flushingCompressedQueue) {
			return;
		}

		this.flushingCompressedQueue = true;

		try {
			while (this.compressedQueueIndex < this.compressedQueue.length) {
				const frame = this.compressedQueue[this.compressedQueueIndex];

				if (!frame || !this.options.perMessageDeflate || this.raw.destroyed) {
					break;
				}

				const result = await (this.compressor?.compress(frame.payload) ??
					Promise.resolve({
						compressed: false,
						payload: frame.payload,
					}));
				this.compressedQueueIndex += 1;

				const wrote = this.writeDataFrame(
					frame.opcode,
					result.payload,
					result.compressed,
				);

				if (!wrote && !this.raw.destroyed) {
					await waitForDrain(this.raw);
				}
			}
		} catch (error) {
			this.emitError(error as Error);
			this.raw.destroy();
		} finally {
			if (this.compressedQueueIndex >= this.compressedQueue.length) {
				this.compressedQueue = [];
				this.compressedQueueIndex = 0;
			}

			this.flushingCompressedQueue = false;

			if (
				this.pendingCloseFrame &&
				!this.hasPendingCompressedFrames() &&
				!this.raw.destroyed
			) {
				this.writeCloseFrame(this.pendingCloseFrame);
				this.pendingCloseFrame = undefined;
			}
		}
	}

	private hasPendingCompressedFrames(): boolean {
		return (
			this.flushingCompressedQueue ||
			this.compressedQueueIndex < this.compressedQueue.length
		);
	}

	private writeCloseFrame(frame: Buffer): void {
		this.hasSentCloseFrame = true;
		this.raw.write(frame);
		this.closeTimer = setTimeout(() => {
			this.terminate();
		}, this.options.closeTimeout);
		this.closeTimer.unref();
		this.raw.end();
	}
}
