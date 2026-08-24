// http/errors.ts
// Throw typed errors, get mapped responses. Unknown errors become 500.
// Run: node --experimental-strip-types examples/http/errors.ts

import { Server, NotFound, BadRequest, HttpError, isHttpError } from "@panmdaa/server";

const server = new Server({
	onError: (error) => console.error("[onError]", error),
});

server.get("/user/:id", ({ params, response }) => {
	if (params.id === "missing") throw new NotFound();
	if (params.id === "invalid") throw new BadRequest("Invalid id");
	throw new HttpError(418, "I'm a teapot", "short and stout");
});

server.get("/throw", () => {
	throw new Error("something unexpected"); // -> 500
});

server.get("/is-http-error", () => {
	// HttpError subclasses are also HttpError instances
	console.log(isHttpError(new NotFound())); // true
	return undefined;
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);