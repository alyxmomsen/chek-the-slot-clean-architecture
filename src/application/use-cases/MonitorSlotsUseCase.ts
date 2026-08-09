import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';
import { ISlotApiService } from '../ports/ISlotApiService';
import { ISnapshotRepository } from '../ports/ISnapshotRepository';
import { INotificationService } from '../ports/INotificationService';
import { ILogger } from '../ports/ILogger';
import { IEventBus } from '../ports/IEventBus';
import { IIntervalScheduleRepository } from '../ports/IIntervalScheduleRepository';
import { CompareSnapshotsUseCase } from './CompareSnapshotsUseCase';
import { GenerateSummaryUseCase } from './GenerateSummaryUseCase';
import { DetectStalenessUseCase } from './DetectStalenessUseCase';
import { config } from '../../config/env';

export interface MonitoredLocation {
    readonly id: number;
    readonly name: string;
    readonly chatId: string;
}

export interface MonitorConfig {
    readonly locations: MonitoredLocation[];
    readonly pollIntervalMs: number;
    readonly staleToleranceMs: number;
    readonly maxRunHours: number;
}

export class MonitorSlotsUseCase {
    private readonly compareUseCase: CompareSnapshotsUseCase;
    private readonly summaryUseCase: GenerateSummaryUseCase;
    private readonly stalenessUseCase: DetectStalenessUseCase;
    private currentPollInterval: number;

    constructor(
        private readonly apiService: ISlotApiService,
        private readonly snapshotRepo: ISnapshotRepository,
        private readonly notificationService: INotificationService,
        private readonly logger: ILogger,
        private readonly config: MonitorConfig,
        private readonly eventBus: IEventBus,
        private readonly scheduleRepo?: IIntervalScheduleRepository
    ) {
        this.compareUseCase = new CompareSnapshotsUseCase(snapshotRepo);
        this.summaryUseCase = new GenerateSummaryUseCase();
        this.stalenessUseCase = new DetectStalenessUseCase();
        this.currentPollInterval = config.pollIntervalMs;
    }

    setPollInterval(ms: number): void {
        this.currentPollInterval = ms;
        this.logger.info('Poll interval updated', { newIntervalMs: ms });

        // Отправляем оповещение в системный канал
        this.notificationService
            .sendSystemMessage({
                message: `Интервал опроса изменён на ${ms} мс`,
                chatId: '-1000000000006',
            })
            .catch((err) => {
                this.logger.warn(
                    'Failed to send interval change notification',
                    { error: (err as Error).message }
                );
            });
    }

    async start(): Promise<void> {
        this.logger.info('MonitorSlotsUseCase started', {
            locations: this.config.locations.map((l) => l.name),
            pollIntervalMs: this.currentPollInterval,
        });

        // Загружаем расписание интервалов, если репозиторий предоставлен
        let schedule = null;
        if (this.scheduleRepo) {
            schedule = await this.scheduleRepo.load();
            if (schedule) {
                this.logger.info('Polling schedule loaded', {
                    intervals: schedule.intervals.length,
                });
            } else {
                this.logger.info(
                    'No polling schedule found, using default interval'
                );
            }
        }

        let iterationId = 0;

        while (true) {
            // Проверяем активный интервал перед каждой итерацией
            if (schedule) {
                const activeInterval = schedule.getActiveInterval(new Date());
                if (
                    activeInterval &&
                    activeInterval.pollIntervalMs !== this.currentPollInterval
                ) {
                    this.setPollInterval(activeInterval.pollIntervalMs);
                } else if (
                    !activeInterval &&
                    this.currentPollInterval !== this.config.pollIntervalMs
                ) {
                    // Время не покрыто расписанием — возвращаемся к дефолтному интервалу
                    this.setPollInterval(this.config.pollIntervalMs);
                }
            }

            iterationId++;
            const cycleStart = Date.now();

            try {
                const allSlots = await this.apiService.fetchSlots();

                for (const location of this.config.locations) {
                    const currentSlots = allSlots.get(location.id);
                    if (!currentSlots) {
                        this.logger.warn('No slots found for location', {
                            locationId: location.id,
                            name: location.name,
                        });
                        continue;
                    }

                    const oldSnapshot = await this.snapshotRepo.load(
                        location.name
                    );

                    if (!oldSnapshot) {
                        this.logger.info(
                            'First run for location, sending summary',
                            { name: location.name }
                        );
                        await this.notificationService.sendSummary({
                            address: location.name,
                            chatId:
                                config.nodeEnv === 'development'
                                    ? config.devChatId || config.fallbackChatId
                                    : location.chatId,
                            slots: currentSlots,
                            isFirstRun: true,
                        });
                        await this.snapshotRepo.save({
                            locationId: location.id,
                            locationName: location.name,
                            checkedAt: new Date().toISOString(),
                            slots: currentSlots,
                        });

                        this.eventBus.emit('slots:summary', {
                            locationName: location.name,
                            slots: currentSlots,
                            isFirstRun: true,
                        });
                        continue;
                    }

                    const isStale = this.stalenessUseCase.execute(
                        oldSnapshot.checkedAt,
                        this.currentPollInterval,
                        this.config.staleToleranceMs
                    );

                    if (isStale) {
                        this.logger.info('Data is stale, sending summary', {
                            name: location.name,
                            checkedAt: oldSnapshot.checkedAt,
                        });
                        await this.notificationService.sendSummary({
                            address: location.name,
                            chatId:
                                config.nodeEnv === 'development'
                                    ? config.devChatId || config.fallbackChatId
                                    : location.chatId,
                            slots: currentSlots,
                            isFirstRun: false,
                        });
                        await this.snapshotRepo.save({
                            locationId: location.id,
                            locationName: location.name,
                            checkedAt: new Date().toISOString(),
                            slots: currentSlots,
                        });

                        this.eventBus.emit('slots:summary', {
                            locationName: location.name,
                            slots: currentSlots,
                            isFirstRun: false,
                        });
                        continue;
                    }

                    const changes: SlotChange[] =
                        await this.compareUseCase.execute(
                            location.name,
                            currentSlots
                        );

                    if (changes.length > 0) {
                        this.logger.info('Changes detected', {
                            name: location.name,
                            count: changes.length,
                        });
                        await this.notificationService.sendNotification({
                            address: location.name,
                            chatId:
                                config.nodeEnv === 'development'
                                    ? config.devChatId || config.fallbackChatId
                                    : location.chatId,
                            changes: changes,
                        });
                        await this.snapshotRepo.save({
                            locationId: location.id,
                            locationName: location.name,
                            checkedAt: new Date().toISOString(),
                            slots: currentSlots,
                        });

                        this.eventBus.emit('slots:changed', {
                            locationName: location.name,
                            changes,
                            slots: currentSlots,
                        });
                    } else {
                        this.logger.info('No changes', { name: location.name });
                        await this.snapshotRepo.save({
                            locationId: location.id,
                            locationName: location.name,
                            checkedAt: new Date().toISOString(),
                            slots: currentSlots,
                        });
                    }
                }
            } catch (err) {
                this.logger.error(
                    'Cycle error',
                    err instanceof Error ? err : new Error(String(err)),
                    {
                        iterationId,
                    }
                );
            }

            const elapsed = Date.now() - cycleStart;
            const jitter = Math.floor(Math.random() * 200);
            const sleepTime = Math.max(0, this.currentPollInterval - elapsed);
            await new Promise((r) => setTimeout(r, sleepTime + jitter));
        }
    }
}
