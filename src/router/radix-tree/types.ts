export interface FindResult<T> {
	store: T;
	params: Record<string, string>;
	search: string;
}

export interface ParamNode<T> {
	store: T | null;
	storeNames: string[] | null;
	nullProto: boolean;
	inert: Node<T> | null;
}

export interface Node<T> {
	part: string;
	store: T | null;
	paramStore: T | null;
	nullProto: boolean;
	storeNames: string[] | null;
	inert: Record<number, Node<T>> | null;
	params: ParamNode<T> | null;
	wildcardStore: T | null;
	wildcardStoreNames: string[] | null;
}

export type MaybeArray<T> = T | T[];

export type ProcessParam = (value: string, key: string) => unknown;

export interface RadixTreeOptions {
	onParam?: MaybeArray<ProcessParam>;
	loosePath?: boolean;
}
