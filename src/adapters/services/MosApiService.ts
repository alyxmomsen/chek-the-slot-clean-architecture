import { Slot } from '../../core/entities/Slot';
import { ISlotApiService } from '../../core/ports/ISlotApiService';
import { ILogger } from '../../core/ports/ILogger';
import { z } from 'zod';

const ApiSlotSchema = z.record(z.string(), z.record(z.string(), z.boolean()));

const ApiLocationSchema = z.object({
    location_id: z.number(),
    name: z.string(),
    slots: ApiSlotSchema,
});

const ApiResponseSchema = z.object({
    code: z.literal('SUCCESS'),
    data: z.array(ApiLocationSchema),
});

export class MosApiService implements ISlotApiService {
    private readonly baseUrl = 'https://www.mos.ru/api/streetfest/v2/locations';

    constructor(
        private readonly targetIds: number[],
        private readonly logger: ILogger
    ) {}

    async fetchSlots(): Promise<Map<number, Slot[]>> {
        this.logger.info('Fetching slots from API');

        const response = await fetch(this.baseUrl, {
            headers: {
                Accept: 'application/json, text/plain, */*',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: 'https://www.mos.ru/city/projects/streetmusicfest/',
                Origin: 'https://www.mos.ru',
            },
        });

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        const raw = await response.json();
        const json = ApiResponseSchema.parse(raw);

        const result = new Map<number, Slot[]>();

        for (const loc of json.data) {
            if (!this.targetIds.includes(loc.location_id)) continue;

            const slots: Slot[] = [];
            for (const [date, times] of Object.entries(loc.slots)) {
                for (const [time, free] of Object.entries(times)) {
                    slots.push({ date, time, free, artist: null });
                }
            }

            result.set(loc.location_id, slots);
        }

        this.logger.info('Slots fetched', {
            locations: result.size,
            totalSlots: [...result.values()].reduce(
                (sum, s) => sum + s.length,
                0
            ),
        });

        return result;
    }
}
