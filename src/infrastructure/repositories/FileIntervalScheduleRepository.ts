import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { PollingSchedule, PollingInterval } from '../../domain/entities/PollingSchedule';
import { IIntervalScheduleRepository } from '../../application/ports/IIntervalScheduleRepository';
import { ILogger } from '../../application/ports/ILogger';

// Zod-схема для валидации одного интервала
const PollingIntervalSchema = z.object({
  id: z.string().min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  pollIntervalMs: z.number().int().min(500).max(60000),
  endOffsetDays: z.number().int().min(0).max(1).optional(),
});

// Zod-схема для всего файла
const ScheduleFileSchema = z.object({
  intervals: z.array(PollingIntervalSchema),
});

export class FileIntervalScheduleRepository implements IIntervalScheduleRepository {
  private readonly filePath: string;

  constructor(
    private readonly logger: ILogger,
    configDir?: string
  ) {
    this.filePath = path.join(configDir || process.cwd(), 'schedule.json');
  }

  async load(): Promise<PollingSchedule | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = ScheduleFileSchema.parse(parsed);

      // Проверяем коллизии
      try {
        PollingSchedule.validate(validated.intervals);
      } catch (err) {
        this.logger.error('Collision detected in schedule, ignoring file', err instanceof Error ? err : new Error(String(err)));
        return null;
      }

      this.logger.info('Schedule loaded', { intervals: validated.intervals.length });
      return new PollingSchedule(validated.intervals);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.info('Schedule file not found, using default interval');
        return null;
      }
      if (err instanceof z.ZodError) {
        this.logger.error('Invalid schedule format', err);
        return null;
      }
      this.logger.error('Failed to load schedule', err);
      return null;
    }
  }

  async save(schedule: PollingSchedule): Promise<void> {
    const data = { intervals: schedule.intervals };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.info('Schedule saved');
  }
}