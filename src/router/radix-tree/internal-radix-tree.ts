import { PATTERN } from "./constants";
import type { FindResult, Node, ProcessParam, RadixTreeOptions } from "./types";
import {
	applyParam,
	cloneNode,
	composeOnParam,
	createMatchState,
	createNode,
	createParamNode,
	EMPTY_PARAMS,
	matchRoute,
	needsNullProto,
} from "./utils";

interface CompiledRoute<T> {
	store: T;
	paramGroups: number[];
	paramNames: string[];
	wildcardGroup: number;
	nullProto: boolean;
}

interface CompiledMatcher<T> {
	regexp: RegExp;
	markerToRoute: (CompiledRoute<T> | undefined)[];
}

function escapeRegExpChar(ch: string): string {
	return /[.\\+*?^$()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

function segType(seg: string): 0 | 1 | 2 {
	if (seg[0] === ":") return 1;
	if (seg === "*") return 2;
	return 0;
}

// The regex picks the FIRST matching alternative, so routes that could both
// match the same URL must be ordered exactly like the tree (params before
// wildcards). If any pair of routes is ambiguous (a static segment that can
// be shadowed, or shape-identical param routes where the tree keeps the last
// one), the method falls back to tree traversal to preserve precedence.
function hasRouteConflicts(
	a: string,
	b: string,
	wildcardA: boolean,
	wildcardB: boolean,
): boolean {
	// Two wildcards where one swallows the other: the regex picks the first,
	// the tree the deepest. Ambiguous.
	if (wildcardA && wildcardB && (a.startsWith(b) || b.startsWith(a)))
		return true;

	const sa = a.split("/");
	const sb = b.split("/");
	const len = Math.min(sa.length, sb.length);

	let shapeEqual = sa.length === sb.length;
	for (let k = 1; k < len; k++) {
		const ta = segType(sa[k]);
		const tb = segType(sb[k]);

		if (ta === 0 && tb === 0) {
			if (sa[k] !== sb[k]) return false;
		} else if ((ta === 0) !== (tb === 0)) {
			return true;
		}

		if (!(ta === 1 && tb === 1) && sa[k] !== sb[k]) shapeEqual = false;
	}

	if (sa.length !== sb.length) {
		const shorter = sa.length < sb.length ? sa : sb;
		const shorterIsWildcard = sa.length < sb.length ? wildcardA : wildcardB;
		return shorterIsWildcard && segType(shorter[shorter.length - 1]) === 2;
	}

	// Same shape, different names: the tree keeps the LAST registration,
	// the regex the first. Ambiguous.
	return shapeEqual && a !== b;
}

// A shared segment in the trie. Param segments are all keyed by the same
// placeholder because every `:name` compiles to the same capture.
const PARAM_SEGMENT = ":";

interface TrieNode<T> {
	route: { store: T; wildcard: boolean } | null;
	paramName: string | null;
	children: Map<string, TrieNode<T>> | null;
}

function createTrieNode<T>(): TrieNode<T> {
	return { route: null, paramName: null, children: null };
}

function buildMatcher<T>(
	methodRoutes: Record<string, { store: T; wildcard: boolean }>,
): CompiledMatcher<T> | null {
	const paths = Object.keys(methodRoutes);

	for (let i = 0; i < paths.length; i++)
		for (let j = i + 1; j < paths.length; j++)
			if (
				hasRouteConflicts(
					paths[i],
					paths[j],
					methodRoutes[paths[i]].wildcard,
					methodRoutes[paths[j]].wildcard,
				)
			)
				return null;

	// Insert every path into a trie so shared prefixes are factored into a
	// single regex fragment (hono RegExpRouter approach). Flat alternatives
	// duplicate prefixes and force the engine to backtrack past rejected
	// siblings before reaching the matching route.
	const root = createTrieNode<T>();
	for (const path of paths) {
		const { store, wildcard } = methodRoutes[path];
		const segments = path.split("/").slice(1);
		let node = root;

		for (const segment of segments) {
			if (!node.children) node.children = new Map();
			const key = segment.charCodeAt(0) === 58 ? PARAM_SEGMENT : segment;
			let child = node.children.get(key);
			if (!child) {
				child = createTrieNode<T>();
				if (key === PARAM_SEGMENT) child.paramName = segment.slice(1);
				node.children.set(key, child);
			}
			node = child;
		}

		node.route = { store, wildcard };
	}

	const markerToRoute: (CompiledRoute<T> | undefined)[] = [];
	let group = 1;

	const buildNode = (
		node: TrieNode<T>,
		paramGroups: number[],
		paramNames: string[],
	): string => {
		const parts: string[] = [];

		if (node.children) {
			const children = [...node.children.entries()];
			// Static segments before params so a literal match wins over a
			// capture at the same position.
			children.sort((a, b) => {
				if (a[0] === PARAM_SEGMENT) return 1;
				if (b[0] === PARAM_SEGMENT) return -1;
				return a[0] < b[0] ? -1 : 1;
			});

			for (const [key, child] of children) {
				if (key === PARAM_SEGMENT) {
					const paramGroup = group++;
					const segment = "([^/]+)";
					const childFrag = buildNode(
						child,
						[...paramGroups, paramGroup],
						[...paramNames, child.paramName ?? ""],
					);
					parts.push(`/${segment}${childFrag}`);
				} else {
					const segment = escapeRegExpChar(key);
					const childFrag = buildNode(child, paramGroups, paramNames);
					parts.push(`/${segment}${childFrag}`);
				}
			}
		}

		if (node.route) {
			// Empty marker group: after a match, `m.indexOf("", 1)` locates
			// the winning route. It must come BEFORE the wildcard group so an
			// empty wildcard capture can't shadow it.
			const markerGroup = group++;
			let wildcardGroup = -1;
			if (node.route.wildcard) wildcardGroup = group++;

			markerToRoute[markerGroup] = {
				store: node.route.store,
				paramGroups,
				paramNames,
				wildcardGroup,
				nullProto: needsNullProto(paramNames),
			};

			parts.push(node.route.wildcard ? `()(.*)` : `()`);
		}

		if (parts.length === 0) return "";
		if (parts.length === 1) return parts[0];
		return `(?:${parts.join("|")})`;
	};

	const regexp = new RegExp(`^${buildNode(root, [], [])}$`);

	return { regexp, markerToRoute };
}

export class InternalRadixTree<T> {
	root: Record<string, Node<T>> = Object.create(null);
	onParam?: ProcessParam;
	loosePath = false;
	staticRoutes: Record<string, Record<string, FindResult<T>>> =
		Object.create(null);
	private dynamicRoutes: Record<
		string,
		Record<string, { store: T; wildcard: boolean }>
	> = Object.create(null);
	private matchers: Record<string, CompiledMatcher<T> | null | undefined> =
		Object.create(null);

	constructor(options?: RadixTreeOptions) {
		if (options?.loosePath) this.loosePath = true;

		const onParam = options?.onParam;
		if (onParam)
			this.onParam = Array.isArray(onParam)
				? onParam.length === 1
					? onParam[0]
					: composeOnParam(onParam)
				: onParam;
	}

	add(method: string, path: string, store: T): FindResult<T>["store"] {
		if (!path) path = "/";
		else if (path[0] !== "/") path = `/${path}`;

		// Fast path: fully static routes are stored in a flat map
		// (same approach as hono's linear router) so lookups are O(1).
		// The FindResult is prebuilt and shared across requests: static
		// matches have no params and an empty search, so the object is
		// immutable and safe to reuse (no per-request allocation).
		if (path.indexOf(":") === -1 && path.indexOf("*") === -1) {
			let methodRoutes = this.staticRoutes[method];
			if (!methodRoutes)
				methodRoutes = this.staticRoutes[method] = Object.create(null);
			methodRoutes[path] = { store, params: EMPTY_PARAMS, search: "" };
		}

		const isWildcard = path[path.length - 1] === "*";
		// End with ? and is param
		const optionalParams = path.match(PATTERN.optionalParams);

		if (optionalParams) {
			const segments = path.slice(1).split("/");
			const isOptional = (s: string) =>
				s.length > 1 &&
				s.charCodeAt(0) === 58 /* ':' */ &&
				s.charCodeAt(s.length - 1) === 63; /* '?' */

			let tailStart = segments.length;
			while (tailStart > 0 && isOptional(segments[tailStart - 1])) tailStart--;

			let midIdx = -1;
			for (let i = 0; i < tailStart; i++)
				if (isOptional(segments[i])) {
					midIdx = i;
					break;
				}

			if (midIdx !== -1) {
				const without = segments.slice();
				without.splice(midIdx, 1);
				this.add(method, `/${without.join("/")}`, store);

				const kept = segments.slice();
				kept[midIdx] = kept[midIdx].slice(0, -1);
				this.add(method, `/${kept.join("/")}`, store);
				return store;
			}

			const head = segments.slice(0, tailStart);
			const fullTail = segments.slice(tailStart).map((s) => s.slice(0, -1));

			for (let k = 0; k <= fullTail.length; k++) {
				const parts = head.concat(fullTail.slice(0, k));
				const newPath = parts.length === 0 ? "/" : `/${parts.join("/")}`;
				this.add(method, newPath, store);
			}

			return store;
		}

		if (isWildcard)
			// Slice off trailing '*'
			path = path.slice(0, -1);

		const inertParts = path.split(PATTERN.static);
		const paramParts = path.match(PATTERN.params) || [];

		if (inertParts[inertParts.length - 1] === "") inertParts.pop();

		// Dynamic routes are also compiled to a single regex per method
		// (hono RegExpRouter approach) so matching is a native exec().
		if (paramParts.length > 0 || isWildcard) {
			let methodRoutes = this.dynamicRoutes[method];
			if (!methodRoutes)
				methodRoutes = this.dynamicRoutes[method] = Object.create(null);
			methodRoutes[path] = { store, wildcard: isWildcard };
			this.matchers[method] = undefined;
		}

		let node: Node<T>;

		if (!this.root[method]) node = this.root[method] = createNode<T>("/");
		else node = this.root[method];

		let paramPartsIndex = 0;
		const paramNames: string[] = [];

		for (let i = 0; i < inertParts.length; ++i) {
			let part = inertParts[i];

			if (i > 0) {
				// Set param on the node
				const param = paramParts[paramPartsIndex++].slice(1);
				paramNames.push(param);

				if (node.params === null) node.params = createParamNode();

				const params = node.params;

				if (params.inert === null) {
					node = params.inert = createNode(part);
					continue;
				}

				node = params.inert;
			}

			for (let j = 0; ; ) {
				if (j === part.length) {
					if (j < node.part.length) {
						// Move the current node down
						const childNode = cloneNode(node, node.part.slice(j));
						Object.assign(node, createNode(part, [childNode]));
					}
					break;
				}

				if (j === node.part.length) {
					// Add static child
					const inertMap: Record<number, Node<T>> = node.inert ??
					Object.create(null);
					node.inert = inertMap;

					const inert = inertMap[part.charCodeAt(j)];

					if (inert) {
						// Re-run loop with existing static node
						node = inert;
						part = part.slice(j);
						j = 0;
						continue;
					}

					// Create new node
					const childNode = createNode<T>(part.slice(j));
					inertMap[part.charCodeAt(j)] = childNode;
					node = childNode;

					break;
				}

				if (part[j] !== node.part[j]) {
					// Split the node
					const existingChild = cloneNode(node, node.part.slice(j));
					const newChild = createNode<T>(part.slice(j));

					Object.assign(
						node,
						createNode(node.part.slice(0, j), [existingChild, newChild]),
					);

					node = newChild;

					break;
				}

				++j;
			}
		}

		if (paramPartsIndex < paramParts.length) {
			// The final part is a parameter
			const name = paramParts[paramPartsIndex].slice(1);
			paramNames.push(name);

			if (node.params === null) node.params = createParamNode();

			node.params.store = store;
			node.params.storeNames = paramNames;
			node.params.nullProto = needsNullProto(paramNames);

			return node.params.store as T;
		}

		if (isWildcard) {
			// The final part is a wildcard
			paramNames.push("*");

			node.wildcardStore = store;
			node.wildcardStoreNames = paramNames;
			node.nullProto = needsNullProto(paramNames);

			return node.wildcardStore as T;
		}

		// The final part is static
		if (paramNames.length === 0) node.store = store;
		else {
			node.paramStore = store;
			node.storeNames = paramNames;
			node.nullProto = needsNullProto(paramNames);
		}

		return store;
	}

	private getMatcher(method: string): CompiledMatcher<T> | null {
		if (this.matchers[method] !== undefined) return this.matchers[method];

		const routes = this.dynamicRoutes[method];
		this.matchers[method] = routes ? buildMatcher(routes) : null;

		return this.matchers[method];
	}

	find(method: string, url: string): FindResult<T> | null {
		// Fast path: static routes are stored in a flat map (O(1)).
		// Try the raw URL first, matching hono: most requests carry no
		// query string, so the indexOf/slice below only runs on a miss.
		// The cached FindResult is immutable (no params, empty search) and
		// shared across requests: no per-request allocation.
		const methodRoutes = this.staticRoutes[method];
		if (methodRoutes) {
			const found = methodRoutes[url];
			if (found !== undefined) return found;
		}

		const queryIndex = url.indexOf("?");
		const pathLength = queryIndex === -1 ? url.length : queryIndex;
		const path = pathLength === url.length ? url : url.slice(0, pathLength);

		if (methodRoutes) {
			const cached = methodRoutes[path];
			if (cached !== undefined)
				return {
					store: cached.store,
					params: cached.params,
					search: queryIndex === -1 ? "" : url.slice(queryIndex + 1),
				};
		}

		// Fast path: dynamic routes compiled to a single regex per method.
		// The winning route is the first empty group (`m.indexOf("", 1)`),
		// matching the empty marker group each alternative ends with.
		const matcher = this.getMatcher(method);
		if (matcher) {
			const m = matcher.regexp.exec(path);
			if (m) {
				const marker = m.indexOf("", 1);
				const route = matcher.markerToRoute[marker];
				if (route) {
					const params: Record<string, string> = route.nullProto
						? Object.create(null)
						: {};
					for (let k = 0; k < route.paramGroups.length; k++)
						params[route.paramNames[k]] = this.onParam
							? (applyParam(
									m[route.paramGroups[k]] as string,
									route.paramNames[k],
									this.onParam,
								) as string)
							: (m[route.paramGroups[k]] as string);

					if (route.wildcardGroup !== -1)
						params["*"] = this.onParam
							? (applyParam(
									m[route.wildcardGroup] as string,
									"*",
									this.onParam,
								) as string)
							: (m[route.wildcardGroup] as string);

					return this.withSearch(
						{ store: route.store, params, search: "" },
						queryIndex,
						url,
					);
				}
			}
		}

		const root = this.root[method];
		if (!root) return null;

		const state = createMatchState();
		const found = matchRoute(url, pathLength, root, 0, this.onParam, state);
		if (found || !this.loosePath || pathLength <= 1)
			return this.withSearch(found, queryIndex, url);

		const loose =
			url.charCodeAt(pathLength - 1) === 47
				? url.slice(0, pathLength - 1)
				: `${url.slice(0, pathLength)}/`;

		return this.withSearch(
			matchRoute(loose, loose.length, root, 0, this.onParam, state),
			queryIndex,
			url,
		);
	}

	/**
	 * Return every method that has a route matching `url`, used to build the
	 * `Allow` header for a 405 Method Not Allowed response.
	 *
	 * `root` is the single source of truth for registered methods: `add()`
	 * always populates `root[method]`, even for fully static routes that also
	 * hit the `staticRoutes`/`dynamicRoutes` fast paths.
	 */
	methods(url: string): string[] {
		const result: string[] = [];

		for (const method of Object.keys(this.root))
			if (this.find(method, url) !== null) result.push(method);

		return result;
	}

	private withSearch(
		found: FindResult<T> | null,
		queryIndex: number,
		url: string,
	): FindResult<T> | null {
		if (found && queryIndex !== -1) found.search = url.slice(queryIndex + 1);
		return found;
	}
}
