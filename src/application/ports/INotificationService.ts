import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';

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
