import fs from 'fs/promises';
import path from 'path';
import {
    IBookingPoolRepository,
    BookingRecord,
} from '../../application/ports/IBookingPoolRepository';
import { ILogger } from '../../application/ports/ILogger';

export class FileBookingPoolRepository implements IBookingPoolRepository {
    private readonly poolPath: string;
    private records: Map<string, BookingRecord> = new Map();

    constructor(
        private readonly logger: ILogger,
        poolDir?: string
    ) {
        this.poolPath = path.join(
            poolDir || process.cwd(),
            'bookings',
            'pool.json'
        );
    }

    private async persist(): Promise<void> {
        const data = JSON.stringify([...this.records.values()], null, 2);
        await fs.mkdir(path.dirname(this.poolPath), { recursive: true });
        await fs.writeFile(this.poolPath, data, 'utf-8');
    }

    async load(): Promise<void> {
        try {
            const raw = await fs.readFile(this.poolPath, 'utf-8');
            const arr: BookingRecord[] = JSON.parse(raw);
            this.records = new Map(arr.map((r) => [r.id, r]));
            this.logger.info('Booking pool loaded', {
                count: this.records.size,
            });
        } catch (err: any) {
            if (err.code !== 'ENOENT') {
                this.logger.warn(
                    'Could not load booking pool, starting fresh',
                    { error: err.message }
                );
            }
            this.records = new Map();
        }
    }

    async add(record: BookingRecord): Promise<void> {
        this.records.set(record.id, record);
        await this.persist();
    }

    async update(id: string, changes: Partial<BookingRecord>): Promise<void> {
        const existing = this.records.get(id);
        if (!existing) throw new Error(`Booking record ${id} not found`);
        Object.assign(existing, changes);
        await this.persist();
    }

    async getPendingByAgent(agentId: string): Promise<BookingRecord[]> {
        return [...this.records.values()].filter(
            (r) => r.agentId === agentId && r.status === 'resolved'
        );
    }

    async get(id: string): Promise<BookingRecord | null> {
        return this.records.get(id) ?? null;
    }
}
