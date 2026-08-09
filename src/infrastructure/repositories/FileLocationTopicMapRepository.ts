import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import {
    ILocationTopicMapRepository,
    LocationTopicConfig,
} from '../../application/ports/ILocationTopicMapRepository';
import { ILogger } from '../../application/ports/ILogger';

const LocationTopicConfigSchema = z.object({
    locationId: z.number().int().positive(),
    chatId: z.string().min(1),
    topicName: z.string().min(1),
    threadId: z.number().int().positive().nullable(),
});

const LocationTopicFileSchema = z.object({
    topics: z.array(LocationTopicConfigSchema),
});

export class FileLocationTopicMapRepository implements ILocationTopicMapRepository {
    private readonly filePath: string;
    private topics: Map<string, LocationTopicConfig> = new Map(); // ключ: `${locationId}:${topicName}`

    constructor(
        private readonly logger: ILogger,
        configDir?: string,
        private readonly isDevelopment: boolean = process.env.NODE_ENV === 'development'
    ) {
        const filename = this.isDevelopment ? 'location-topics.dev.json' : 'location-topics.json';
        this.filePath = path.join(configDir || process.cwd(), filename);
    }

    async load(): Promise<LocationTopicConfig[]> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            const validated = LocationTopicFileSchema.parse(parsed);

            this.topics.clear();
            for (const topic of validated.topics) {
                const key = `${topic.locationId}:${topic.topicName}`;
                this.topics.set(key, topic);
            }

            this.logger.info('Location topics loaded', {
                count: this.topics.size,
            });
            return [...this.topics.values()];
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                this.logger.info(
                    'Location topics file not found, starting fresh'
                );
                return [];
            }
            if (err instanceof z.ZodError) {
                this.logger.error('Invalid location topics format', err);
                return [];
            }
            this.logger.error('Failed to load location topics', err);
            return [];
        }
    }

    async save(configs: LocationTopicConfig[]): Promise<void> {
        const data = { topics: configs };
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(
            this.filePath,
            JSON.stringify(data, null, 2),
            'utf-8'
        );
        this.logger.info('Location topics saved', { count: configs.length });
    }

    async updateThreadId(
        locationId: number,
        topicName: string,
        threadId: number
    ): Promise<void> {
        const key = `${locationId}:${topicName}`;
        const existing = this.topics.get(key);
        if (existing) {
            existing.threadId = threadId;
        } else {
            // Если записи ещё нет — создаём (на случай, если топик создаётся вручную)
            this.topics.set(key, {
                locationId,
                chatId: '',
                topicName,
                threadId,
            }); // chatId будет обновлён при следующем save
        }
        await this.save([...this.topics.values()]);
    }

    getTopic(
        locationId: number,
        topicName: string
    ): LocationTopicConfig | undefined {
        return this.topics.get(`${locationId}:${topicName}`);
    }
}
