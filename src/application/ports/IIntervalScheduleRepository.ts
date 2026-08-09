import { PollingSchedule } from '../../domain/entities/PollingSchedule';

export interface IIntervalScheduleRepository {
    load(): Promise<PollingSchedule | null>;
    save(schedule: PollingSchedule): Promise<void>;
}
