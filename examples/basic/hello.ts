// basic/hello.ts
// The smallest possible server. Copy-paste and run:
//   node --experimental-strip-types examples/basic/hello.ts

import { Server } from "@panmdaa/server";

const server = new Server();

server.get("/", ({ response }) => {
	response.send("Hello, world!");
});

server.get("/hello/:name", ({ params, response }) => {
	response.json({ hello: params.name });
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);