import { EventEmitter } from "node:events";

type EventListener<
	Events extends object,
	EventName extends Extract<keyof Events, string>,
> = Events[EventName] extends any[]
	? (...args: Events[EventName]) => void
	: never;

export class TypedEventEmitter<Events extends object> extends EventEmitter {
	override on<EventName extends Extract<keyof Events, string>>(
		eventName: EventName,
		listener: EventListener<Events, EventName>,
	): this {
		return super.on(eventName, listener);
	}

	override once<EventName extends Extract<keyof Events, string>>(
		eventName: EventName,
		listener: EventListener<Events, EventName>,
	): this {
		return super.once(eventName, listener);
	}

	override off<EventName extends Extract<keyof Events, string>>(
		eventName: EventName,
		listener: EventListener<Events, EventName>,
	): this {
		return super.off(eventName, listener);
	}

	override emit<EventName extends Extract<keyof Events, string>>(
		eventName: EventName,
		...args: Events[EventName] extends any[] ? Events[EventName] : never
	): boolean {
		return super.emit(eventName, ...args);
	}
}
