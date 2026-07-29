import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { ILogger } from '../application/ports/ILogger';
import { IEventBus } from '../application/ports/IEventBus';
import { ISnapshotRepository } from '../application/ports/ISnapshotRepository';
import { MonitoredLocation } from '../application/use-cases/MonitorSlotsUseCase';
import { ReportController } from './controllers/ReportController';
import { HealthController } from './controllers/HealthController';
import { config } from '../config/env';

export interface ServerDependencies {
  logger: ILogger;
  eventBus: IEventBus;
  snapshotRepo: ISnapshotRepository;
  locations: MonitoredLocation[];
}

export function createServer(deps: ServerDependencies) {
  const { logger, eventBus, snapshotRepo, locations } = deps;

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
      locations: locations.map(loc => ({ id: loc.id, name: loc.name })),
    });
  });

  // Статус всех площадок (REST)
  app.get('/status', async (_req, res) => {
    try {
      const result: Record<string, unknown> = {};
      for (const loc of locations) {
        const snapshot = await snapshotRepo.load(loc.name);
        result[loc.name] = snapshot ? {
          checkedAt: snapshot.checkedAt,
          slots: snapshot.slots,
        } : { checkedAt: null, slots: [] };
      }
      res.json({ ok: true, locations: result });
    } catch (err) {
      logger.error('Failed to get status', err instanceof Error ? err : new Error(String(err)));
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
      res.json({ ok: true, checkedAt: snapshot.checkedAt, slots: snapshot.slots });
    } catch (err) {
      logger.error('Failed to get status', err instanceof Error ? err : new Error(String(err)));
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

  // Запуск HTTP-сервера
  app.listen(config.apiPort, config.apiHost, () => {
    logger.info(`HTTP server started on http://${config.apiHost}:${config.apiPort}`);
  });

  // WebSocket-сервер
  const wss = new WebSocketServer({
    host: config.apiHost,
    port: config.wsPort,
    verifyClient: (info: { origin: string; req: { headers: { origin?: string } } }) => {
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
          ws.send(JSON.stringify({ event: 'info', data: { message: 'Refresh request received' } }));
        }
      } catch {
        // ignore invalid messages
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });
  });

  logger.info(`WebSocket server started on ws://${config.apiHost}:${config.wsPort}`);
}