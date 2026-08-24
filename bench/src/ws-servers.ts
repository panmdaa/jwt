import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { Server as PanmdaaServer } from "../../src/http/server/server";
import { listenHttp, listenPanmdaa } from "./servers";

const require = createRequire(import.meta.url);
const { WebSocketServer } = require("ws");

export interface BenchWsServer {
	name: string;
	start: () => Promise<{ port: number; close: () => Promise<void> }>;
}

function echoPanmdaa(): BenchWsServer {
	return {
		name: "panmdaa",
		start: () => {
			const server = new PanmdaaServer();
			server.ws("/", ({ socket }) => {
				socket.on("message", (event) => socket.send(event.data));
			});
			return listenPanmdaa(server);
		},
	};
}

function echoWs(): BenchWsServer {
	return {
		name: "ws (baseline)",
		start: async () => {
			const server = createHttpServer();
			const wss = new WebSocketServer({ server });
			wss.on("connection", (ws) => {
				ws.on("message", (data) => ws.send(data));
			});
			return listenHttp(server);
		},
	};
}

export const BENCH_WS_SERVERS: BenchWsServer[] = [echoPanmdaa(), echoWs()];
