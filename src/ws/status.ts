import { STATUS_CODES } from "node:http";

export function statusMessage(statusCode: number): string {
	return STATUS_CODES[statusCode] ?? "Internal Server Error";
}
