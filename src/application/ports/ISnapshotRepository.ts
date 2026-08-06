import { Snapshot } from '../../domain/entities/Snapshot';

export interface ISnapshotRepository {
    load(locationName: string): Promise<Snapshot | null>;
    save(snapshot: Snapshot): Promise<void>;
}
