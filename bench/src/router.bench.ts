import findMyWayFactory from "find-my-way";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { bench, describe } from "vitest";
import { RadixTree } from "../../src/router/radix-tree/radix-tree";
import {
	DEEP_MATCHING_PATHS,
	DEEP_ROUTES,
	DYNAMIC_PATHS,
	LARGE_MATCHING_PATHS,
	LARGE_ROUTES,
	MATCHING_PATHS,
	type MatchEntry,
	registerRoutes,
	registerRoutesFmw,
	registerRoutesHono,
	STATIC_PATHS,
	WILDCARD_PATHS,
} from "./shared";

const radixTree = new RadixTree<MatchEntry>();
registerRoutes(radixTree);

const honoRouter = new RegExpRouter<MatchEntry>();
registerRoutesHono(honoRouter);

const findMyWay = findMyWayFactory();
registerRoutesFmw(findMyWay);

const deepRadix = new RadixTree<MatchEntry>();
registerRoutes(deepRadix, DEEP_ROUTES);
const deepHono = new RegExpRouter<MatchEntry>();
registerRoutesHono(deepHono, DEEP_ROUTES);
const deepFmw = findMyWayFactory();
registerRoutesFmw(deepFmw, DEEP_ROUTES);

const largeRadix = new RadixTree<MatchEntry>();
registerRoutes(largeRadix, LARGE_ROUTES);
const largeHono = new RegExpRouter<MatchEntry>();
registerRoutesHono(largeHono, LARGE_ROUTES);
const largeFmw = findMyWayFactory();
registerRoutesFmw(largeFmw, LARGE_ROUTES);

describe("route matching (all)", () => {
	bench("panmdaa radix-tree", () => {
		for (const [method, path] of MATCHING_PATHS) radixTree.find(method, path);
	});

	bench("hono reg-exp-router", () => {
		for (const [method, path] of MATCHING_PATHS) honoRouter.match(method, path);
	});

	bench("find-my-way (fastify)", () => {
		for (const [method, path] of MATCHING_PATHS)
			findMyWay.find(method as never, path);
	});
});

describe("route matching (static only)", () => {
	bench("panmdaa radix-tree", () => {
		for (const [method, path] of STATIC_PATHS) radixTree.find(method, path);
	});

	bench("hono reg-exp-router", () => {
		for (const [method, path] of STATIC_PATHS) honoRouter.match(method, path);
	});

	bench("find-my-way (fastify)", () => {
		for (const [method, path] of STATIC_PATHS)
			findMyWay.find(method as never, path);
	});
});

describe("route matching (dynamic only)", () => {
	bench("panmdaa radix-tree", () => {
		for (const [method, path] of DYNAMIC_PATHS) radixTree.find(method, path);
	});

	bench("hono reg-exp-router", () => {
		for (const [method, path] of DYNAMIC_PATHS) honoRouter.match(method, path);
	});

	bench("find-my-way (fastify)", () => {
		for (const [method, path] of DYNAMIC_PATHS)
			findMyWay.find(method as never, path);
	});
});

describe("route matching (wildcard)", () => {
	bench("panmdaa radix-tree", () => {
		for (const [method, path] of WILDCARD_PATHS) radixTree.find(method, path);
	});

	bench("hono reg-exp-router", () => {
		for (const [method, path] of WILDCARD_PATHS) honoRouter.match(method, path);
	});

	bench("find-my-way (fastify)", () => {
		for (const [method, path] of WILDCARD_PATHS)
			findMyWay.find(method as never, path);
	});
});

describe("route matching (deep dynamic segments)", () => {
	bench("panmdaa radix-tree", () => {
		for (const [method, path] of DEEP_MATCHING_PATHS)
			deepRadix.find(method, path);
	});

	bench("hono reg-exp-router", () => {
		for (const [method, path] of DEEP_MATCHING_PATHS)
			deepHono.match(method, path);
	});

	bench("find-my-way (fastify)", () => {
		for (const [method, path] of DEEP_MATCHING_PATHS)
			deepFmw.find(method as never, path);
	});
});

describe("route matching (large route table)", () => {
	bench("panmdaa radix-tree", () => {
		for (const [method, path] of LARGE_MATCHING_PATHS)
			largeRadix.find(method, path);
	});

	bench("hono reg-exp-router", () => {
		for (const [method, path] of LARGE_MATCHING_PATHS)
			largeHono.match(method, path);
	});

	bench("find-my-way (fastify)", () => {
		for (const [method, path] of LARGE_MATCHING_PATHS)
			largeFmw.find(method as never, path);
	});
});
