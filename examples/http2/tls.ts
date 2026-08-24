// http2/tls.ts
// HTTP/2 (h2c), or HTTP/2 + TLS via ALPN. For TLS you need a key + cert:
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
// Run (h2c): node --experimental-strip-types examples/http2/tls.ts

import { readFileSync } from "node:fs";
import { Server } from "@panmdaa/server";

// Plain h2c server:
const server = new Server({ http2: true });

// HTTP/1.1 + HTTP/2 on the same TLS port (ALPN):
// const server = new Server({
//   http2: true,
//   tls: { key: readFileSync("./key.pem"), cert: readFileSync("./cert.pem") },
// });

server.get("/", ({ response }) => response.send("hello over http/2"));
server.ws("/live", ({ socket }) => {
	socket.send("websocket over http/2 (extended CONNECT)");
});

server.listen(3000);
console.log(`Listening on http://localhost:${server.address()?.port}`);