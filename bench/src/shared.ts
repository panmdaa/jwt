import type { RadixTree } from "../../src/router";

export const ROUTES: Array<[string, string]> = [
	["GET", "/"],
	["GET", "/user"],
	["GET", "/user/:id"],
	["GET", "/user/:id/books"],
	["POST", "/user"],
	["POST", "/user/:id/books/:bookId"],
	["GET", "/api/v1/users"],
	["GET", "/api/v1/users/:id"],
	["PUT", "/api/v1/users/:id"],
	["DELETE", "/api/v1/users/:id"],
	["GET", "/api/v1/orders"],
	["GET", "/api/v1/orders/:id"],
	["GET", "/api/v1/products"],
	["GET", "/api/v1/products/:id/search"],
	["GET", "/static/*"],
];

/** Deeply nested routes with multiple dynamic segments. */
export const DEEP_ROUTES: Array<[string, string]> = [
	["GET", "/api/v2/orgs/:orgId/projects/:projectId/issues/:issueId"],
	["GET", "/api/v2/orgs/:orgId/projects/:projectId/boards/:boardId"],
	["GET", "/api/v2/orgs/:orgId/teams/:teamId/members/:memberId"],
	["POST", "/api/v2/orgs/:orgId/projects/:projectId/issues"],
	["PUT", "/api/v2/orgs/:orgId/projects/:projectId/issues/:issueId"],
	["GET", "/api/v2/orgs/:orgId/repos/:repoId/pulls/:pullId/files"],
	["GET", "/api/v2/orgs/:orgId/repos/:repoId/commits/:sha/checks"],
	["DELETE", "/api/v2/orgs/:orgId/repos/:repoId/releases/:releaseId"],
	["GET", "/api/v2/orgs/:orgId/actions/runners/:runnerId/jobs"],
	["GET", "/api/v2/orgs/:orgId/packages/:packageType/:packageName/versions"],
];

/** Large generated route table to stress scalability. */
export const LARGE_ROUTES: Array<[string, string]> = (() => {
	const routes: Array<[string, string]> = [];
	for (let group = 0; group < 20; group++) {
		for (let item = 0; item < 50; item++) {
			routes.push([
				item % 2 === 0 ? "GET" : "POST",
				`/g${group}/item/${item}/view`,
			]);
		}
	}
	return routes;
})();

export const MATCHING_PATHS: Array<[string, string]> = [
	["GET", "/"],
	["GET", "/user/42"],
	["GET", "/user/42/books"],
	["POST", "/user/42/books/99"],
	["GET", "/api/v1/users/7"],
	["GET", "/api/v1/orders/xyz"],
	["GET", "/static/css/main.css"],
];

export const DEEP_MATCHING_PATHS: Array<[string, string]> = [
	["GET", "/api/v2/orgs/acme/projects/web/issues/123"],
	["GET", "/api/v2/orgs/acme/projects/web/boards/sprint-1"],
	["GET", "/api/v2/orgs/acme/teams/core/members/kko"],
	["POST", "/api/v2/orgs/acme/projects/web/issues"],
	["PUT", "/api/v2/orgs/acme/projects/web/issues/123"],
	["GET", "/api/v2/orgs/acme/repos/server/pulls/9/files"],
	["GET", "/api/v2/orgs/acme/repos/server/commits/abc123/checks"],
	["DELETE", "/api/v2/orgs/acme/repos/server/releases/v1.0"],
	["GET", "/api/v2/orgs/acme/actions/runners/r-7/jobs"],
	["GET", "/api/v2/orgs/acme/packages/npm/@panmdaa/server/versions"],
];

export const LARGE_MATCHING_PATHS: Array<[string, string]> = [
	["GET", "/g3/item/12/view"],
	["POST", "/g3/item/13/view"],
	["GET", "/g11/item/0/view"],
	["POST", "/g17/item/49/view"],
	["GET", "/g0/item/7/view"],
	["GET", "/g19/item/33/view"],
];

export const WILDCARD_PATHS: Array<[string, string]> = [
	["GET", "/static/js/app.js"],
	["GET", "/static/css/main.css"],
	["GET", "/static/img/logo.svg"],
	["GET", "/static/fonts/Inter.woff2"],
];

export const STATIC_PATHS: Array<[string, string]> = [
	["GET", "/"],
	["GET", "/user"],
	["GET", "/api/v1/users"],
	["GET", "/api/v1/orders"],
	["GET", "/api/v1/products"],
	["POST", "/user"],
];

export const DYNAMIC_PATHS: Array<[string, string]> = [
	["GET", "/user/42"],
	["GET", "/user/42/books"],
	["POST", "/user/42/books/99"],
	["GET", "/api/v1/users/7"],
	["GET", "/api/v1/orders/xyz"],
	["GET", "/api/v1/products/7/search"],
	["GET", "/static/css/main.css"],
];

export type MatchEntry = { method: string; path: string };

export function registerRoutes(
	tree: RadixTree<MatchEntry>,
	routes: Array<[string, string]> = ROUTES,
): void {
	for (const [method, path] of routes) tree.add(method, path, { method, path });
}

export function registerRoutesFmw<
	T extends { on: (...args: never[]) => unknown },
>(router: T, routes: Array<[string, string]> = ROUTES): void {
	for (const [method, path] of routes)
		(router.on as unknown as (m: string, p: string, h: () => void) => void)(
			method,
			path,
			() => undefined,
		);
}

export function registerRoutesHono(
	router: {
		add: (method: string, path: string, handler: MatchEntry) => void;
	},
	routes: Array<[string, string]> = ROUTES,
): void {
	for (const [method, path] of routes)
		router.add(method, path, { method, path });
}

export interface BenchResult {
	name: string;
	requests: number;
	requestsPerSecond: number;
	latencyMs: number;
	throughputBytes: number;
}
