// http/body.ts
// Lazy request body: json, text, raw, formData, stream, arrayBuffer.
// Run: node --experimental-strip-types examples/http/body.ts

import { Server } from "@panmdaa/server";

const server = new Server({ maxBodySize: 2 * 1024 * 1024 }); // 2 MiB

server.post("/echo/json", async ({ body, response }) => {
	const json = await body.json(); // parses; reuses text if already decoded
	response.json({ received: json });
});

server.post("/echo/text", async ({ body, response }) => {
	response.send(await body.text());
});

server.post("/echo/form", async ({ body, response }) => {
	const form = await body.formData(); // urlencoded + multipart
	response.json({
		fields: Object.fromEntries(form.entries()),
	});
});

server.post("/echo/raw", async ({ body, response }) => {
	const raw = await body.raw(); // Buffer
	response.json({ bytes: raw.byteLength });
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);