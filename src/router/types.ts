import type { Handler } from "../http/handler";

type Params<S extends string> = S extends `:${infer Name}?`
	? Name extends ""
		? Record<string, string | undefined>
		: { [K in Name]?: string }
	: S extends `:${infer Name}`
		? Name extends ""
			? Record<string, string | undefined>
			: { [K in Name]: string }
		: S extends "*"
			? { "*": string }
			: Record<string, string | undefined>;

type Segments<T extends string> = T extends `${infer Segment}/${infer Rest}`
	? Params<Segment> & Segments<Rest>
	: Params<T>;

// Aplana intersecciones recursivamente
type Merge<T> =
	T extends Record<string, unknown> ? { [K in keyof T]: T[K] } : T;

export type Path<T extends `/${string}`> = Merge<
	Segments<T extends `/${infer Rest}` ? Rest : T>
>;

export type RouteEntry = [method: string, path: string, handler: Handler<any>];
