export interface IEventBus {
    emit(event: string, data: unknown): void;
    subscribe(listener: (event: string, data: unknown) => void): void;
}
