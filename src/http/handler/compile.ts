import type { CompiledHandler, Handler } from "./types";

export function compileHandler<T = object>(
	...handlers: Handler<T>[]
): CompiledHandler<T> {
	const length = handlers.length;

	if (length === 0) {
		return (_ctx, next) => next?.();
	}

	if (length === 1) {
		return handlers[0] as CompiledHandler<T>;
	}

	// Código optimizado: se usa 'var' y función declarada. El cuerpo no se
	// desenrolla demasiado: solo se espera a un handler cuando realmente
	// devolvió una promesa, así los handlers síncronos no pagan una microtask
	// por request.
	const lines: string[] = [];
	lines.push("var nextCalled = false;");
	lines.push("function advance(){nextCalled=true;}");

	for (let i = 0; i < length; i++) {
		if (i > 0) {
			// Si el handler anterior NO llamó a next, terminamos.
			lines.push("if(!nextCalled)return;");
			// Reiniciamos para el siguiente handler.
			lines.push("nextCalled=false;");
		}
		// Solo esperamos cuando el handler devolvió una promesa: los handlers
		// síncronos no pagan una microtask por request.
		lines.push(
			`var r${i}=h${i}(ctx,advance);if(r${i}!=null&&typeof r${i}.then==="function")await r${i};`,
		);
	}

	// Después del último handler, si llamó a next, invocamos el next externo.
	lines.push("if(nextCalled)return next?.();");

	const params = handlers.map((_, i) => `h${i}`);

	// Construimos el cuerpo con sangría mínima para reducir el tamaño.
	const source = `return async function(ctx,next){${lines.join("")}}`;

	return new Function(...params, source)(...handlers) as CompiledHandler<T>;
}
