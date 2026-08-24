// http/static.ts
// Serve files with auto mime + Content-Length, and force downloads.
// Run: node --experimental-strip-types examples/http/static.ts

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "@panmdaa/server";

const here = dirname(fileURLToPath(import.meta.url));

const server = new Server();

// Serve a single file inline
server.get("/readme", async ({ response }) => {
	await response.file(join(here, "../../README.md"));
});

// Force a download with a custom filename
server.get("/download", async ({ response }) => {
	await response.download(join(here, "../../README.md"), "readme.md");
});

// Wildcard static file server (path traversal is your problem, app-level)
server.get("/public/*", async ({ params, response }) => {
	try {
		await response.file(join(here, "public", params["*"]));
	} catch {
		response.status = 404;
		response.send("not found");
	}
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);