// rest-api/todos.ts
// A complete CRUD REST API: router composition, middleware, typed errors,
// lazy body, query strings, and proper status codes.
// Run: node --experimental-strip-types examples/rest-api/todos.ts

import {
	Server,
	Router,
	cors,
	securityHeaders,
	NotFound,
	BadRequest,
} from "@panmdaa/server";

interface Todo {
	id: number;
	title: string;
	done: boolean;
}

const todos = new Map<number, Todo>();
let nextId = 1;

const todoRouter = new Router();

todoRouter.get("/", ({ query, response }) => {
	const onlyOpen = query.done === "false";
	const list = [...todos.values()].filter((t) => !onlyOpen || !t.done);
	response.json(list);
});

todoRouter.get("/:id", ({ params, response }) => {
	const todo = todos.get(Number(params.id));
	if (!todo) throw new NotFound("Todo not found");
	response.json(todo);
});

todoRouter.post("/", async ({ body, response }) => {
	const input = await body.json();
	if (typeof input.title !== "string" || input.title.length === 0) {
		throw new BadRequest("title is required", "body.title");
	}
	const todo: Todo = { id: nextId++, title: input.title, done: false };
	todos.set(todo.id, todo);
	response.status = 201;
	response.json(todo);
});

todoRouter.patch("/:id", async ({ params, body, response }) => {
	const todo = todos.get(Number(params.id));
	if (!todo) throw new NotFound("Todo not found");
	const input = await body.json();
	if (typeof input.done === "boolean") todo.done = input.done;
	if (typeof input.title === "string") todo.title = input.title;
	response.json(todo);
});

todoRouter.delete("/:id", ({ params, response }) => {
	if (!todos.delete(Number(params.id))) throw new NotFound("Todo not found");
	response.status = 204;
	response.end();
});

const server = new Server({
	onError: (error) => console.error("[onError]", error),
});

server.use(securityHeaders());
server.use(cors({ allowOrigin: "*", allowMethods: ["GET", "POST", "PATCH", "DELETE"] }));

server.router("/api/todos", todoRouter);
server.get("/", ({ response }) => response.send("Todo API — try /api/todos"));

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}/api/todos`);