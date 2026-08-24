// http/middleware.ts
// Built-in cors/securityHeaders plus a custom middleware.
// Run: node --experimental-strip-types examples/http/middleware.ts

import { Server, cors, securityHeaders } from "@panmdaa/server";

const server = new Server();

server.use(securityHeaders());
server.use(cors({ allowOrigin: ["https://app.example.com"] }));
server.use(({ state, response }, next) => {
	state.startedAt = performance.now();
	response.header("x-powered-by", "panmdaa");
	next();
});

server.get("/", ({ state, response }) => {
	response.json({ took: performance.now() - (state.startedAt as number) });
});

server.post("/login", ({ body, response }, next) => {
	// a middleware may short-circuit (never call next())
	response.status = 204;
	response.end();
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);