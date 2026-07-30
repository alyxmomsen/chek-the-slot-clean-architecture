import request from 'supertest';
import { createServer } from '../server';
import { ILogger } from '../../application/ports/ILogger';
import { IEventBus } from '../../application/ports/IEventBus';
import { ISnapshotRepository } from '../../application/ports/ISnapshotRepository';
import { MonitorSlotsUseCase, MonitorConfig, MonitoredLocation } from '../../application/use-cases/MonitorSlotsUseCase';
import { ConfigRepository } from '../../infrastructure/repositories/ConfigRepository';
import { Server } from 'http';
import { WebSocketServer } from 'ws';

describe('PATCH /config', () => {
  let app: Express.Application;
  let httpServer: Server;
  let wss: WebSocketServer;
  let logger: jest.Mocked<ILogger>;
  let eventBus: jest.Mocked<IEventBus>;
  let snapshotRepo: jest.Mocked<ISnapshotRepository>;
  let monitorUseCase: jest.Mocked<MonitorSlotsUseCase>;
  let configRepository: jest.Mocked<ConfigRepository>;

  const locations: MonitoredLocation[] = [
    { id: 1, name: 'Test Location', chatId: 'test-chat' },
  ];

  beforeEach(() => {
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
    eventBus = { emit: jest.fn(), subscribe: jest.fn() } as any;
    snapshotRepo = { load: jest.fn(), save: jest.fn() } as any;
    monitorUseCase = { setPollInterval: jest.fn() } as any;
    configRepository = { savePollInterval: jest.fn() } as any;

    const server = createServer({
      logger,
      eventBus,
      snapshotRepo,
      locations,
      monitorUseCase: monitorUseCase as unknown as MonitorSlotsUseCase,
      configRepository: configRepository as unknown as ConfigRepository,
    });
    app = server.app;
    httpServer = server.httpServer;
    wss = server.wss;
  });

  afterEach(() => {
    httpServer.close();
    wss.close();
  });

  it('должен изменить интервал при корректном запросе с токеном', async () => {
    const res = await request(app as any)
      .patch('/config')
      .set('Authorization', 'Bearer change-me')
      .send({ pollIntervalMs: 2000 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pollIntervalMs: 2000 });
    expect(monitorUseCase.setPollInterval).toHaveBeenCalledWith(2000);
    expect(configRepository.savePollInterval).toHaveBeenCalledWith(2000);
  });

  it('должен вернуть 401 без токена', async () => {
    const res = await request(app as any)
      .patch('/config')
      .send({ pollIntervalMs: 2000 });

    expect(res.status).toBe(401);
  });

  it('должен вернуть 400 при невалидном интервале', async () => {
    const res = await request(app as any)
      .patch('/config')
      .set('Authorization', 'Bearer change-me')
      .send({ pollIntervalMs: 100 });

    expect(res.status).toBe(400);
  });
});