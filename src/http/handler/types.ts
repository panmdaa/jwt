export type Next = () => void;

export type Handler<T = object> = (
	ctx: T,
	next: Next,
) => unknown | Promise<unknown>;

export type CompiledHandler<T = object> = (
	ctx: T,
	next?: Next,
) => unknown | Promise<unknown>;
