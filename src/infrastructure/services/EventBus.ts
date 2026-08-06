import { IEventBus } from '../../application/ports/IEventBus';

export class EventBus implements IEventBus {
    private listeners: Array<(event: string, data: unknown) => void> = [];

    emit(event: string, data: unknown): void {
        for (const fn of this.listeners) {
            fn(event, data);
        }
    }

    subscribe(listener: (event: string, data: unknown) => void): void {
        this.listeners.push(listener);
    }
}
