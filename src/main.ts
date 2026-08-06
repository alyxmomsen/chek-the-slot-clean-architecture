import { config } from './config/env';
import { WinstonLogger } from './infrastructure/services/WinstonLogger';
import { MosApiService } from './infrastructure/services/MosApiService';
import { FileSnapshotRepository } from './infrastructure/repositories/FileSnapshotRepository';
import { TelegramNotificationService } from './infrastructure/services/TelegramNotificationService';
import { EventBus } from './infrastructure/services/EventBus';
import {
    MonitorSlotsUseCase,
    MonitorConfig,
    MonitoredLocation,
} from './application/use-cases/MonitorSlotsUseCase';
import { ConfigRepository } from './infrastructure/repositories/ConfigRepository';
import { createServer } from './presentation/server';

(async () => {
    // 1. Логгер
    const logger = new WinstonLogger();

    // 2. Конфигурация локаций
    const locations: MonitoredLocation[] = [
        { id: 1, name: 'Арбат 1', chatId: '-1000000000001' },
        { id: 59, name: 'Арбат 35', chatId: '-1000000000002' },
        { id: 12, name: 'Петровка 5', chatId: '-1000000000003' },
        { id: 20, name: 'Триумфальная', chatId: '-1000000000004' },
    ];

    // 3. Репозиторий конфигурации (читает config.json)
    const configRepository = new ConfigRepository(logger);
    const savedInterval = await configRepository.loadPollInterval();

    let monitorConfig: MonitorConfig = {
        locations,
        pollIntervalMs: savedInterval ?? config.pollIntervalMs, // из файла или .env
        staleToleranceMs: config.staleToleranceMs,
        maxRunHours: config.maxRunHours,
    };

    // 4. Адаптеры
    const apiService = new MosApiService(
        locations.map((l) => l.id),
        logger
    );
    const snapshotRepo = new FileSnapshotRepository(
        config.snapshotsDir,
        logger
    );
    const notificationService = new TelegramNotificationService(
        config.botToken,
        config.fallbackChatId,
        logger
    );
    const eventBus = new EventBus();

    // 5. Use Case
    const monitorUseCase = new MonitorSlotsUseCase(
        apiService,
        snapshotRepo,
        notificationService,
        logger,
        monitorConfig,
        eventBus
    );

    // 6. Запуск HTTP/WS сервера (Presentation)
    createServer({
        logger,
        eventBus,
        snapshotRepo,
        locations,
        monitorUseCase,
        configRepository,
    });

    // 7. Запуск мониторинга в фоне
    monitorUseCase.start().catch((err) => {
        logger.error(
            'Fatal error in monitor',
            err instanceof Error ? err : new Error(String(err))
        );
    });
})();
