export interface Slot {
    readonly date: string; // "2026-07-20"
    readonly time: string; // "10:00"
    readonly free: boolean;
    readonly artist: string | null;
}
