import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';

export interface INotificationService {
    sendNotification(options: {
        address: string;
        changes: SlotChange[];
        chatId: string;
    }): Promise<void>;

    sendSummary(options: {
        address: string;
        chatId: string;
        slots: Slot[];
        isFirstRun: boolean;
    }): Promise<void>;

    sendSystemMessage(options: {
        message: string;
        chatId?: string; // если не указан, используется fallback-чат
    }): Promise<void>;
}
