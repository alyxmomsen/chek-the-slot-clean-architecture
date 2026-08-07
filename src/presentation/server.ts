import { config } from '../config/env';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { ILogger } from '../application/ports/ILogger';
import { IEventBus } from '../application/ports/IEventBus';
import { ISnapshotRepository } from '../application/ports/ISnapshotRepository';
import { MonitoredLocation } from '../application/use-cases/MonitorSlotsUseCase';
import { ReportController } from './controllers/ReportController';
import { HealthController } from './controllers/HealthController';
import { MonitorSlotsUseCase } from '../application/use-cases/MonitorSlotsUseCase';
import { ConfigRepository } from '../infrastructure/repositories/ConfigRepository';
import { Server } from 'http';
import { BookingRecord } from '../application/ports/IBookingPoolRepository';
import { IBookingPoolRepository } from '../application/ports/IBookingPoolRepository';
import { TelegramNotificationService } from '../infrastructure/services/TelegramNotificationService';

export interface ServerDependencies {
    logger: ILogger;
    eventBus: IEventBus;
    snapshotRepo: ISnapshotRepository;
    locations: MonitoredLocation[];
    monitorUseCase: MonitorSlotsUseCase;
    configRepository: ConfigRepository;
    bookingPool: IBookingPoolRepository;
    telegramService: TelegramNotificationService;
}

const PatchConfigSchema = z.object({
    pollIntervalMs: z.number().int().min(500).max(60000),
});

export const BookingResultSchema = z.object({
    agentId: z.string().min(1),
    locationId: z.number().int().positive(),
    locationName: z.string().min(1),
    chatId: z.string().min(1), // <-- добавили
    success: z.boolean(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    bookingId: z.string().min(1),
    timestamp: z.string().datetime(),
});

export function createServer(deps: ServerDependencies): {
    app: express.Application;
    httpServer: Server;
    wss: WebSocketServer;
} {
    const {
        logger,
        eventBus,
        snapshotRepo,
        locations,
        monitorUseCase,
        configRepository,
    } = deps;

    const app = express();
    app.use(cors({ origin: config.corsOrigin }));
    app.use(express.json());

    const reportController = new ReportController(logger);
    const healthController = new HealthController();

    // Health check
    app.get('/health', (req, res) => healthController.handle(req, res));

    // Приём отчётов от подчинённых
    app.post('/report', (req, res) => reportController.handle(req, res));

    // Список всех локаций
    app.get('/locations', (_req, res) => {
        res.json({
            ok: true,
            locations: locations.map((loc) => ({ id: loc.id, name: loc.name })),
        });
    });

    // Статус всех площадок (REST)
    app.get('/status', async (_req, res) => {
        try {
            const result: Record<string, unknown> = {};
            for (const loc of locations) {
                const snapshot = await snapshotRepo.load(loc.name);
                result[loc.name] = snapshot
                    ? {
                          checkedAt: snapshot.checkedAt,
                          slots: snapshot.slots,
                      }
                    : { checkedAt: null, slots: [] };
            }
            res.json({ ok: true, locations: result });
        } catch (err) {
            logger.error(
                'Failed to get status',
                err instanceof Error ? err : new Error(String(err))
            );
            res.status(500).json({ ok: false, error: 'Internal error' });
        }
    });

    // Статус конкретной площадки (REST)
    app.get('/status/:name', async (req, res) => {
        try {
            const snapshot = await snapshotRepo.load(req.params.name);
            if (!snapshot) {
                res.status(404).json({ ok: false, error: 'Not found' });
                return;
            }
            res.json({
                ok: true,
                checkedAt: snapshot.checkedAt,
                slots: snapshot.slots,
            });
        } catch (err) {
            logger.error(
                'Failed to get status',
                err instanceof Error ? err : new Error(String(err))
            );
            res.status(500).json({ ok: false, error: 'Internal error' });
        }
    });

    // SSE (Server-Sent Events)
    app.get('/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const listener = (event: string, data: unknown) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        eventBus.subscribe(listener);

        req.on('close', () => {
            logger.info('SSE client disconnected');
        });
    });

    // Управление интервалом опроса (PATCH /config)
    app.patch('/config', async (req, res) => {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${config.apiToken}`) {
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }

        const result = PatchConfigSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                ok: false,
                error: 'Invalid pollIntervalMs',
                details: result.error.issues,
            });
            return;
        }

        const { pollIntervalMs } = result.data;
        monitorUseCase.setPollInterval(pollIntervalMs);

        try {
            await configRepository.savePollInterval(pollIntervalMs);
            res.json({ ok: true, pollIntervalMs });
        } catch (err) {
            logger.error(
                'Failed to save config',
                err instanceof Error ? err : new Error(String(err))
            );
            res.status(500).json({ ok: false, error: 'Failed to save config' });
        }
    });

    app.post('/booking-result', async (req, res) => {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${config.apiToken}`) {
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }

        const result = BookingResultSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                ok: false,
                error: 'Invalid body',
                details: result.error.issues,
            });
            return;
        }

        const {
            agentId,
            locationId,
            locationName,
            chatId,
            date,
            time,
            bookingId,
            timestamp,
        } = result.data;

        const record: BookingRecord = {
            id: `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            agentId,
            locationId,
            locationName,
            chatId,
            date,
            time,
            bookingId,
            status: 'pending',
            notifiedToTelegram: false,
            resolution: null,
            resolvedBy: null,
            resolvedAt: null,
            createdAt: timestamp,
        };

        await deps.bookingPool.add(record);

        // Отправка в Telegram с кнопкой
        await deps.telegramService.sendBookingResult({
            address: locationName,
            chatId,
            record,
        });

        // Обновить статус на notified
        await deps.bookingPool.update(record.id, {
            status: 'notified',
            notifiedToTelegram: true,
        });

        res.json({ ok: true, recordId: record.id });
    });

    app.get('/pending-actions/:agentId', async (req, res) => {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${config.apiToken}`) {
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }

        const records = await deps.bookingPool.getPendingByAgent(
            req.params.agentId
        );
        res.json({ ok: true, actions: records });
    });

    app.post('/booking-action-complete', async (req, res) => {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${config.apiToken}`) {
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }

        const { recordId, action } = req.body; // упрощённая валидация
        await deps.bookingPool.update(recordId, {
            status: 'completed',
            resolution: action,
        });
        // Опционально: удалить запись или пометить как архивную
        res.json({ ok: true });
    });

    // Запуск HTTP-сервера
    const httpServer = app.listen(config.apiPort, config.apiHost, () => {
        logger.info(
            `HTTP server started on http://${config.apiHost}:${config.apiPort}`
        );
    });

    // WebSocket-сервер
    const wss = new WebSocketServer({
        host: config.apiHost,
        port: config.wsPort,
        verifyClient: (info: {
            origin: string;
            req: { headers: { origin?: string } };
        }) => {
            const origin = info.origin || info.req?.headers?.origin || '';
            if (config.corsOrigin === '*') return true;
            return origin === config.corsOrigin;
        },
    });

    wss.on('connection', (ws) => {
        logger.info('WebSocket client connected');

        const listener = (event: string, data: unknown) => {
            ws.send(JSON.stringify({ event, data }));
        };
        eventBus.subscribe(listener);

        ws.on('message', (msg) => {
            try {
                const { action } = JSON.parse(msg.toString());
                if (action === 'refresh') {
                    ws.send(
                        JSON.stringify({
                            event: 'info',
                            data: { message: 'Refresh request received' },
                        })
                    );
                }
            } catch {
                // ignore invalid messages
            }
        });

        ws.on('close', () => {
            logger.info('WebSocket client disconnected');
        });
    });

    logger.info(
        `WebSocket server started on ws://${config.apiHost}:${config.wsPort}`
    );

    return { app, httpServer, wss };
}
