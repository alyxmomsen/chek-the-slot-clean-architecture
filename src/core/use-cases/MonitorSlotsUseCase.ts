import { Slot } from '../entities/Slot';
import { SlotChange } from '../entities/SlotChange';
import { ISlotApiService } from '../ports/ISlotApiService';
import { ISnapshotRepository } from '../ports/ISnapshotRepository';
import { INotificationService } from '../ports/INotificationService';
import { ILogger } from '../ports/ILogger';
import { IEventBus } from '../ports/IEventBus';
import { CompareSnapshotsUseCase } from './CompareSnapshotsUseCase';
import { GenerateSummaryUseCase } from './GenerateSummaryUseCase';
import { DetectStalenessUseCase } from './DetectStalenessUseCase';

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

  constructor(
    private readonly apiService: ISlotApiService,
    private readonly snapshotRepo: ISnapshotRepository,
    private readonly notificationService: INotificationService,
    private readonly logger: ILogger,
    private readonly config: MonitorConfig,
    private readonly eventBus: IEventBus,
  ) {
    this.compareUseCase = new CompareSnapshotsUseCase(snapshotRepo);
    this.summaryUseCase = new GenerateSummaryUseCase();
    this.stalenessUseCase = new DetectStalenessUseCase();
  }

  async start(): Promise<void> {
    this.logger.info('MonitorSlotsUseCase started', {
      locations: this.config.locations.map(l => l.name),
      pollIntervalMs: this.config.pollIntervalMs,
      maxRunHours: this.config.maxRunHours,
    });

    const startTime = Date.now();
    const maxDurationMs = this.config.maxRunHours * 60 * 60 * 1000;
    let iterationId = 0;

    while (Date.now() - startTime < maxDurationMs) {
      iterationId++;
      const cycleStart = Date.now();

      try {
        const allSlots = await this.apiService.fetchSlots();

        for (const location of this.config.locations) {
          const currentSlots = allSlots.get(location.id);
          if (!currentSlots) {
            this.logger.warn('No slots found for location', { locationId: location.id, name: location.name });
            continue;
          }

          const oldSnapshot = await this.snapshotRepo.load(location.name);

          if (!oldSnapshot) {
            this.logger.info('First run for location, sending summary', { name: location.name });
            await this.notificationService.sendSummary(
              location.name,
              location.chatId,
              currentSlots,
              true,
            );
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
            this.config.pollIntervalMs,
            this.config.staleToleranceMs,
          );

          if (isStale) {
            this.logger.info('Data is stale, sending summary', {
              name: location.name,
              checkedAt: oldSnapshot.checkedAt,
            });
            await this.notificationService.sendSummary(
              location.name,
              location.chatId,
              currentSlots,
              false,
            );
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

          const changes: SlotChange[] = await this.compareUseCase.execute(location.name, currentSlots);

          if (changes.length > 0) {
            this.logger.info('Changes detected', { name: location.name, count: changes.length });
            await this.notificationService.sendChanges(location.name, location.chatId, changes);
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
        this.logger.error('Cycle error', err instanceof Error ? err : new Error(String(err)), {
          iterationId,
        });
      }

      const elapsed = Date.now() - cycleStart;
      const sleepTime = Math.max(0, this.config.pollIntervalMs - elapsed);
      await new Promise(r => setTimeout(r, sleepTime));
    }

    this.logger.info('MonitorSlotsUseCase finished');
  }
}