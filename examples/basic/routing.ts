// basic/routing.ts
// Verbs, params, wildcards, groups and router composition.
// Run: node --experimental-strip-types examples/basic/routing.ts

import { Router, Server } from "@panmdaa/server";

const users = new Router();
users.get("/:id", ({ params, response }) => {
	response.json({ user: params.id });
});
users.post("/", ({ body, response }) => {
	// body available on body-capable verbs
	response.status = 201;
	response.json({ created: true });
});

const server = new Server();

// static, param, optional-segment and wildcard routes
server.get("/", ({ response }) => response.send("index"));
server.get("/user/:id", ({ params, response }) => {
	response.json({ id: params.id }); // params.id is typed
});
server.get("/user/:id?/books", ({ params, response }) => {
	response.json({ userId: params.id });
});
server.get("/static/*", ({ params, response }) => {
	response.json({ file: params["*"] }); // everything after /static/
});

// body-capable "read" route (not a real HTTP verb)
server.query("/api/search", async ({ body, response }) => {
	const query = await body.json();
	response.json({ search: query });
});

// group a prefix in place
server.group("/api", (api) => {
	api.get("/health", ({ response }) => response.send("ok"));
});

// mount an existing router under a prefix
server.router("/users", users);

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);