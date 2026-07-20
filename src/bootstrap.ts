import { MosApiService } from './adapters/services/MosApiService';
import { FileSnapshotRepository } from './adapters/repositories/FileSnapshotRepository';
import { TelegramNotificationService } from './adapters/services/TelegramNotificationService';
import { ConsoleLogger } from './adapters/services/ConsoleLogger';
import {
    MonitorSlotsUseCase,
    MonitorConfig,
    MonitoredLocation,
} from './core/use-cases/MonitorSlotsUseCase';
import { config } from './config/env';

// 1. Конфигурация
const locations: MonitoredLocation[] = [
    { id: 1, name: 'Арбат 1', chatId: '-1000000000001' },
    { id: 59, name: 'Арбат 35', chatId: '-1000000000002' },
    { id: 12, name: 'Петровка 5', chatId: '-1000000000003' },
    { id: 20, name: 'Триумфальная', chatId: '-1000000000004' },
];

const monitorConfig: MonitorConfig = {
    locations,
    pollIntervalMs: config.pollIntervalMs,
    staleToleranceMs: config.staleToleranceMs,
    maxRunHours: config.maxRunHours,
};

// 2. Логгер
const logger = new ConsoleLogger();

// 3. Адаптеры
const apiService = new MosApiService(
    locations.map((l) => l.id),
    logger
);
const snapshotRepo = new FileSnapshotRepository(config.snapshotsDir, logger);
const notificationService = new TelegramNotificationService(
    config.botToken,
    config.fallbackChatId,
    logger
);

// 4. UseCase
const monitorUseCase = new MonitorSlotsUseCase(
    apiService,
    snapshotRepo,
    notificationService,
    logger,
    monitorConfig
);

// 5. Запуск
monitorUseCase.start().catch((err) => {
    logger.error('Fatal error', err);
    process.exit(1);
});
