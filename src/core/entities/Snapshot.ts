import { Slot } from './Slot';

export interface Snapshot {
    readonly locationId: number;
    readonly locationName: string;
    readonly checkedAt: string; // ISO 8601
    readonly slots: Slot[];
}
