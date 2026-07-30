import {
    MonitorSlotsUseCase,
    MonitorConfig,
    MonitoredLocation,
} from '../MonitorSlotsUseCase';
import { ISlotApiService } from '../../ports/ISlotApiService';
import { ISnapshotRepository } from '../../ports/ISnapshotRepository';
import { INotificationService } from '../../ports/INotificationService';
import { ILogger } from '../../ports/ILogger';
import { IEventBus } from '../../ports/IEventBus';

describe('MonitorSlotsUseCase', () => {
    let useCase: MonitorSlotsUseCase;
    let apiService: jest.Mocked<ISlotApiService>;
    let snapshotRepo: jest.Mocked<ISnapshotRepository>;
    let notificationService: jest.Mocked<INotificationService>;
    let logger: jest.Mocked<ILogger>;
    let eventBus: jest.Mocked<IEventBus>;
    let config: MonitorConfig;

    const locations: MonitoredLocation[] = [
        { id: 1, name: 'Test Location', chatId: 'test-chat' },
    ];

    beforeEach(() => {
        apiService = { fetchSlots: jest.fn() } as any;
        snapshotRepo = { load: jest.fn(), save: jest.fn() } as any;
        notificationService = {
            sendChanges: jest.fn(),
            sendSummary: jest.fn(),
        } as any;
        logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
        eventBus = { emit: jest.fn(), subscribe: jest.fn() } as any;

        config = {
            locations,
            pollIntervalMs: 5000,
            staleToleranceMs: 5000,
            maxRunHours: 8,
        };

        useCase = new MonitorSlotsUseCase(
            apiService,
            snapshotRepo,
            notificationService,
            logger,
            config,
            eventBus
        );
    });

    describe('setPollInterval', () => {
        it('должен обновить внутренний интервал опроса', () => {
            useCase.setPollInterval(2000);
            expect(logger.info).toHaveBeenCalledWith('Poll interval updated', {
                newIntervalMs: 2000,
            });
        });

        it('должен принимать любое значение (валидация на уровне эндпоинта)', () => {
            useCase.setPollInterval(100);
            expect(logger.info).toHaveBeenCalledWith('Poll interval updated', {
                newIntervalMs: 100,
            });
        });
    });
});
