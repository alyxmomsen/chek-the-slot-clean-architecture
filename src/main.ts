import { config } from './config/env';
import { WinstonLogger } from './infrastructure/services/WinstonLogger';
import { MosApiService } from './infrastructure/services/MosApiService';
import { FileSnapshotRepository } from './infrastructure/repositories/FileSnapshotRepository';
import { TelegramNotificationService } from './infrastructure/services/TelegramNotificationService';
import { EventBus } from './infrastructure/services/EventBus';
import { MonitorSlotsUseCase, MonitorConfig, MonitoredLocation } from './application/use-cases/MonitorSlotsUseCase';
import { createServer } from './presentation/server';

// 1. Логгер
const logger = new WinstonLogger();

// 2. Конфигурация локаций
const locations: MonitoredLocation[] = [
  { id: 1,  name: 'Арбат 1',        chatId: '-1000000000001' },
  { id: 59, name: 'Арбат 35',       chatId: '-1000000000002' },
  { id: 12, name: 'Петровка 5',     chatId: '-1000000000003' },
  { id: 20, name: 'Триумфальная',   chatId: '-1000000000004' },
];

const monitorConfig: MonitorConfig = {
  locations,
  pollIntervalMs: config.pollIntervalMs,
  staleToleranceMs: config.staleToleranceMs,
  maxRunHours: config.maxRunHours,
};

// 3. Адаптеры
const apiService = new MosApiService(locations.map(l => l.id), logger);
const snapshotRepo = new FileSnapshotRepository(config.snapshotsDir, logger);
const notificationService = new TelegramNotificationService(config.botToken, config.fallbackChatId, logger);
const eventBus = new EventBus();

// 4. Use Case
const monitorUseCase = new MonitorSlotsUseCase(
  apiService,
  snapshotRepo,
  notificationService,
  logger,
  monitorConfig,
  eventBus,
);

// 5. Запуск HTTP/WS сервера (Presentation)
createServer({
  logger,
  eventBus,
  snapshotRepo,
  locations,
});

// 6. Запуск мониторинга в фоне
monitorUseCase.start().catch(err => {
  logger.error('Fatal error in monitor', err instanceof Error ? err : new Error(String(err)));
});