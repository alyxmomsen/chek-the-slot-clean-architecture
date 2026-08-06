import { Slot } from '../../domain/entities/Slot';

export interface ISlotApiService {
    fetchSlots(): Promise<Map<number, Slot[]>>;
}
