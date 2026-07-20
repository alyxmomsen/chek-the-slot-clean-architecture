import express from 'express';
import { config } from './config/env';
import { ConsoleLogger } from './adapters/services/ConsoleLogger';
import { MosApiService } from './adapters/services/MosApiService';
import { FileSnapshotRepository } from './adapters/repositories/FileSnapshotRepository';
import { TelegramNotificationService } from './adapters/services/TelegramNotificationService';
import {
    MonitorSlotsUseCase,
    MonitorConfig,
    MonitoredLocation,
} from './core/use-cases/MonitorSlotsUseCase';
import { ReportController } from './adapters/controllers/ReportController';
import { HealthController } from './adapters/controllers/HealthController';

// 1. Логгер
const logger = new ConsoleLogger();

// 2. Конфигурация локаций
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

// 5. Контроллеры
const reportController = new ReportController(logger);
const healthController = new HealthController();

// 6. Express-сервер
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => healthController.handle(req, res));

// Приём отчётов от подчинённых
app.post('/report', (req, res) => reportController.handle(req, res));

// Запуск сервера
const PORT = config.apiPort || 3001;
app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`);
});

// 7. Запуск мониторинга в фоне
monitorUseCase.start().catch((err) => {
    logger.error('Fatal error in monitor', err);
});
