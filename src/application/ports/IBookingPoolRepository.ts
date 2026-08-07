export interface BookingRecord {
    id: string;
    agentId: string;
    locationId: number;
    locationName: string;
    chatId: string; // <-- добавили
    date: string;
    time: string;
    bookingId: string;
    status: 'pending' | 'notified' | 'resolved' | 'completed';
    notifiedToTelegram: boolean;
    resolution: 'keep' | 'cancel' | null;
    resolvedBy: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

export interface IBookingPoolRepository {
    add(record: BookingRecord): Promise<void>;
    update(id: string, changes: Partial<BookingRecord>): Promise<void>;
    getPendingByAgent(agentId: string): Promise<BookingRecord[]>;
    get(id: string): Promise<BookingRecord | null>;
}
