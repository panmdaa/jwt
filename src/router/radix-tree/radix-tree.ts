import { InternalRadixTree } from "./internal-radix-tree";
import type { FindResult, RadixTreeOptions } from "./types";

export class RadixTree<T> extends InternalRadixTree<T> {
	private deferred: [string, string, T][] = [];

	constructor(options?: RadixTreeOptions) {
		super(options);
		this.find = this.lazyFind;
	}

	override add(method: string, path: string, store: T): FindResult<T>["store"] {
		this.deferred.push([method, path, store]);
		this.find = this.lazyFind;

		return store;
	}

	private build(): void {
		for (const [method, path, store] of this.deferred)
			super.add(method, path, store);

		this.deferred = [];
		this.find = InternalRadixTree.prototype.find;
	}

	private lazyFind(method: string, url: string): FindResult<T> | null {
		this.build();

		return this.find(method, url);
	}

	override methods(url: string): string[] {
		this.build();

		return super.methods(url);
	}
}
