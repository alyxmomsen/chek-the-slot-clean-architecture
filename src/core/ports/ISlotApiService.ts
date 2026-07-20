import { Slot } from '../entities/Slot';

export interface ISlotApiService {
    fetchSlots(): Promise<Map<number, Slot[]>>;
}
