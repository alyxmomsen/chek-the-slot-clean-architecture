import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';

export interface INotificationService {
    sendNotification(options: {
        address: string;
        changes: SlotChange[];
        chatId: string;
        locationId: number; // <- добавлено
    }): Promise<void>;

    sendSummary(options: {
        address: string;
        chatId: string;
        slots: Slot[];
        isFirstRun: boolean;
        locationId: number; // <- добавлено
    }): Promise<void>;

    sendSystemMessage(options: {
        message: string;
        chatId?: string;
        locationId?: number; // <- добавлено (опционально, для гибкости)
    }): Promise<void>;
}
