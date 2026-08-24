import type { FindResult, Node, ParamNode, ProcessParam } from "./types";

/** Shared empty params for static matches. Never mutated by the tree. */
export const EMPTY_PARAMS: Record<string, string> = Object.freeze({});

/**
 * Mutable state threaded through the matchRoute recursion so param names
 * collected at the leaf are available while unwinding, without module-level
 * globals that break when matches interleave.
 */
export interface MatchState {
	names: string[];
	index: number;
}

export function createMatchState(): MatchState {
	return { names: [], index: 0 };
}

export function createNode<T>(part: string, inert?: Node<T>[]): Node<T> {
	const inertMap: Record<number, Node<T>> | null = inert?.length
		? Object.create(null)
		: null;

	if (inertMap)
		for (const child of inert ?? []) inertMap[child.part.charCodeAt(0)] = child;

	return {
		part,
		store: null,
		nullProto: false,
		paramStore: null,
		storeNames: null,
		inert: inertMap,
		params: null,
		wildcardStore: null,
		wildcardStoreNames: null,
	};
}

export function cloneNode<T>(node: Node<T>, part: string): Node<T> {
	return {
		...node,
		part,
	};
}

export function createParamNode<T>(): ParamNode<T> {
	return {
		store: null,
		storeNames: null,
		nullProto: false,
		inert: null,
	};
}

export function composeOnParam(fns: ProcessParam[]): ProcessParam {
	return (value, key) => {
		let current: unknown = value;
		let mutated = false;

		for (let i = 0; i < fns.length; i++) {
			const result = fns[i](current as string, key);
			if (result !== undefined) {
				current = result;
				mutated = true;
			}
		}

		return mutated ? current : undefined;
	};
}

/** Wildcard leaf: '*' is the deepest capture, any params above fill while unwinding */
export function wildcardLeaf<T>(
	node: Node<T>,
	value: string,
	onParam: ProcessParam | undefined,
	state: MatchState,
): FindResult<T> {
	const names = node.wildcardStoreNames ?? [];
	if (names.length > 1) {
		state.names = names;
		state.index = names.length - 2;
	}

	return {
		search: "",
		store: node.wildcardStore as T,
		params: seedParams("*", value, onParam, node.nullProto),
	};
}

/** `params['__proto__'] = value` is a silent no-op on a plain object */
export function needsNullProto(names: string[]) {
	return names.indexOf("__proto__") !== -1;
}

export function seedParams(
	name: string,
	value: unknown,
	onParam: ProcessParam | undefined,
	nullProto: boolean,
) {
	// Plain object unless the route names a param `__proto__`, where the write
	// would be a silent no-op. Null-proto costs nothing on JSC but makes `for…in`
	// over the result ~12x slower on V8, which is what consumers pay
	const params: Record<string, string> = nullProto ? Object.create(null) : {};
	params[name] = onParam
		? (applyParam(value, name, onParam) as string)
		: (value as string);

	return params;
}

export function matchRoute<T>(
	url: string,
	urlLength: number,
	node: Node<T>,
	startIndex: number,
	onParam: ProcessParam | undefined,
	state: MatchState,
): FindResult<T> | null {
	const part = node.part;
	const length = part.length;
	const endIndex = startIndex + length;

	if (length > 1) {
		if (endIndex > urlLength) return null;

		// Using a loop is faster for short strings
		if (length < 15) {
			for (let i = 1, j = startIndex + 1; i < length; ++i, ++j)
				if (part.charCodeAt(i) !== url.charCodeAt(j)) return null;
		} else if (url.slice(startIndex, endIndex) !== part) return null;
	}

	// Reached the end of the URL
	if (endIndex === urlLength) {
		// No params can be written into this one, so the shared constant is safe
		if (node.store !== null)
			return { search: "", store: node.store, params: EMPTY_PARAMS };

		if (node.paramStore !== null) {
			// Every name is filled by an unwinding frame above
			const names = node.storeNames ?? [];
			state.names = names;
			state.index = names.length - 1;

			return {
				search: "",
				store: node.paramStore,
				params: node.nullProto ? Object.create(null) : {},
			};
		}

		if (node.wildcardStore !== null)
			return wildcardLeaf(node, "", onParam, state);

		return null;
	}

	// Check for a static leaf
	if (node.inert !== null) {
		const inert = node.inert[url.charCodeAt(endIndex)];

		if (inert !== undefined) {
			const route = matchRoute(url, urlLength, inert, endIndex, onParam, state);

			if (route !== null) return route;
		}
	}

	// Check for dynamic leaf
	if (node.params !== null) {
		const { store, storeNames, inert } = node.params;
		const slashIndex = url.indexOf("/", endIndex);

		if (slashIndex !== endIndex) {
			// Params cannot be empty
			if (slashIndex === -1 || slashIndex >= urlLength) {
				if (store !== null) {
					const names = storeNames ?? [];
					const last = names.length - 1;

					if (last > 0) {
						state.names = names;
						state.index = last - 1;
					}

					return {
						search: "",
						store,
						params: seedParams(
							names[last],
							url.substring(endIndex, urlLength),
							onParam,
							node.params.nullProto,
						),
					};
				}
			} else if (inert !== null) {
				const route = matchRoute(
					url,
					urlLength,
					inert,
					slashIndex,
					onParam,
					state,
				);

				if (route !== null) {
					const name = state.names[--state.index];
					const value: string = url.substring(endIndex, slashIndex);

					route.params[name] = onParam
						? (applyParam(value, name, onParam) as string)
						: value;

					return route;
				}
			}
		}
	}

	// Check for wildcard leaf
	if (node.wildcardStore !== null)
		return wildcardLeaf(
			node,
			url.substring(endIndex, urlLength),
			onParam,
			state,
		);

	return null;
}

export const applyParam = (
	value: unknown,
	name: string,
	onParam: ProcessParam,
) => onParam(value as string, name) ?? value;
