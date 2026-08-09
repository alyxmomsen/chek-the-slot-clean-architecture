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
import { FileBookingPoolRepository } from './infrastructure/repositories/FileBookingPoolRepository';
import { createServer } from './presentation/server';
import { FileIntervalScheduleRepository } from './infrastructure/repositories/FileIntervalScheduleRepository';

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
    const configRepository = new ConfigRepository(logger, config.configsRootDir);
    const savedInterval = await configRepository.loadPollInterval();

    const monitorConfig: MonitorConfig = {
        locations,
        pollIntervalMs: savedInterval ?? config.pollIntervalMs,
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

    // Пул бронирований
    const bookingPoolRepo = new FileBookingPoolRepository(logger, config.configsRootDir);
    await bookingPoolRepo.load();

    const scheduleRepo = new FileIntervalScheduleRepository(logger, config.configsRootDir);

    const telegramToken =
        config.nodeEnv === 'development' && config.botTokenDev
            ? config.botTokenDev
            : config.botToken;

    // Сервис уведомлений (теперь с доступом к пулу бронирований)
    const notificationService = new TelegramNotificationService(
        telegramToken,
        config.fallbackChatId,
        logger,
        bookingPoolRepo,
        config.logsRootDir,
    );

    const eventBus = new EventBus();

    // 5. Use Case
    const monitorUseCase = new MonitorSlotsUseCase(
        apiService,
        snapshotRepo,
        notificationService,
        logger,
        monitorConfig,
        eventBus,
        scheduleRepo,
    );

    // 6. Запуск HTTP/WS сервера (Presentation)
    createServer({
        logger,
        eventBus,
        snapshotRepo,
        locations,
        monitorUseCase,
        configRepository,
        bookingPool: bookingPoolRepo,
        telegramService: notificationService,
    });

    // Запуск Telegram-бота для приёма callback-запросов
    notificationService.launch();

    // 7. Запуск мониторинга в фоне
    monitorUseCase.start().catch((err) => {
        logger.error(
            'Fatal error in monitor',
            err instanceof Error ? err : new Error(String(err))
        );
    });
})();
