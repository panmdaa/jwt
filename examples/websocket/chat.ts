// websocket/chat.ts
// WebSocket routes + heartbeat + broadcast. Test with a ws client:
//   node --experimental-strip-types examples/websocket/chat.ts
//   (then connect to ws://localhost:3000/live)
// Run: node --experimental-strip-types 06-websocket-chat.ts

import {
	Server,
	createWebSocketHeartbeat,
	CloseCode,
	type WebSocketConnection,
} from "@panmdaa/server";

const server = new Server({
	websocket: {
		maxPayload: "1mb",
		perMessageDeflate: { threshold: "1kb" },
		verifyClient: ({ headers }) =>
			headers.authorization === "Bearer secret" ||
			({ ok: false, status: 403, message: "Forbidden" }),
	},
});

const heartbeat = createWebSocketHeartbeat({ intervalMs: 30_000, timeoutMs: 10_000 });
const clients = new Set<WebSocketConnection>();

server.ws("/live", ({ socket }) => {
	clients.add(socket);
	heartbeat.track(socket);

	socket.send("welcome!");
	socket.on("message", ({ data, isBinary }) => {
		for (const client of clients) {
			client.send(isBinary ? data : `echo: ${data}`);
		}
	});
	socket.on("close", ({ code, reason }) => {
		clients.delete(socket);
		console.log("closed", code, reason);
	});
});

server.get("/close-all", ({ response }) => {
	for (const socket of clients) socket.close(CloseCode.GoingAway, "server restart");
	response.send("closing all sockets");
});

server.listen(3000);
console.log(`Listening on ws://localhost:${server.address()?.port}/live`);