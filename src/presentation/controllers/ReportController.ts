import { Request, Response } from 'express';
import { z } from 'zod';
import { ILogger } from '../../application/ports/ILogger';
import { MonitorSlotsUseCase } from '../../application/use-cases/MonitorSlotsUseCase';

const ReportSchema = z.object({
    locationId: z.number().int().positive(),
    locationName: z.string().min(1),
    slots: z.array(
        z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            time: z.string().regex(/^\d{2}:\d{2}$/),
            free: z.boolean(),
            artist: z.string().nullable(),
        })
    ),
    timestamp: z.string().datetime(),
    subordinateId: z.string().min(1),
});

export class ReportController {
    constructor(private readonly logger: ILogger) {}

    handle(req: Request, res: Response): void {
        const result = ReportSchema.safeParse(req.body);

        if (!result.success) {
            this.logger.warn('Invalid report body', {
                errors: result.error.issues,
            });
            res.status(400).json({
                ok: false,
                error: 'Invalid body',
                details: result.error.issues,
            });
            return;
        }

        const { locationId, locationName, slots, timestamp, subordinateId } =
            result.data;

        this.logger.info('Report received', {
            locationId,
            locationName,
            subordinateId,
            slotCount: slots.length,
        });

        // Здесь будет обработка: сравнение со снапшотом, отправка уведомлений
        // Пока просто логируем и отвечаем OK

        res.json({ ok: true });
    }
}
