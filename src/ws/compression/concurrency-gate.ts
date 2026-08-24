const DEFAULT_CONCURRENCY_LIMIT = 10;
const concurrencyGates = new Map<number, ZlibConcurrencyGate>();

export class ZlibConcurrencyGate {
	private active = 0;
	private readonly pending: Array<() => void> = [];

	constructor(private readonly limit: number) {}

	async run<T>(task: () => Promise<T>): Promise<T> {
		if (this.active >= this.limit) {
			await new Promise<void>((resolve) => {
				this.pending.push(resolve);
			});
		}

		this.active += 1;

		try {
			return await task();
		} finally {
			this.active -= 1;
			this.pending.shift()?.();
		}
	}
}

export function getConcurrencyGate(limit: number): ZlibConcurrencyGate {
	const normalizedLimit =
		Number.isFinite(limit) && limit > 0
			? Math.max(1, Math.trunc(limit))
			: DEFAULT_CONCURRENCY_LIMIT;
	const existing = concurrencyGates.get(normalizedLimit);

	if (existing) {
		return existing;
	}

	const gate = new ZlibConcurrencyGate(normalizedLimit);
	concurrencyGates.set(normalizedLimit, gate);
	return gate;
}
