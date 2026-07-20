import { Slot } from '../entities/Slot';
import { SlotChange } from '../entities/SlotChange';

export interface INotificationService {
    sendChanges(
        locationName: string,
        chatId: string,
        changes: SlotChange[]
    ): Promise<void>;
    sendSummary(
        locationName: string,
        chatId: string,
        slots: Slot[],
        isFirstRun: boolean
    ): Promise<void>;
}
