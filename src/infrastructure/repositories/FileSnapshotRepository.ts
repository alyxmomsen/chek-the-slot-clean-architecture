import fs from 'fs/promises';
import path from 'path';
import { Snapshot } from '../../domain/entities/Snapshot';
import { ISnapshotRepository } from '../../application/ports/ISnapshotRepository';
import { ILogger } from '../../application/ports/ILogger';

export class FileSnapshotRepository implements ISnapshotRepository {
    constructor(
        private readonly snapshotsDir: string,
        private readonly logger: ILogger
    ) {}

    async load(locationName: string): Promise<Snapshot | null> {
        const filename = this.getFilename(locationName);

        try {
            const data = await fs.readFile(filename, 'utf-8');
            const parsed = JSON.parse(data);

            if (!parsed || !Array.isArray(parsed.slots)) {
                this.logger.warn('Invalid snapshot format', { filename });
                return null;
            }

            return {
                locationId: parsed.locationId,
                locationName: parsed.locationName,
                checkedAt: parsed.checkedAt,
                slots: parsed.slots,
            };
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                this.logger.info('Snapshot not found (first run)', {
                    locationName,
                });
                return null;
            }
            this.logger.error('Failed to load snapshot', err, { filename });
            throw err;
        }
    }

    async save(snapshot: Snapshot): Promise<void> {
        const filename = this.getFilename(snapshot.locationName);

        await fs.mkdir(path.dirname(filename), { recursive: true });

        const data = {
            locationId: snapshot.locationId,
            locationName: snapshot.locationName,
            checkedAt: snapshot.checkedAt,
            totalSlots: snapshot.slots.length,
            freeSlots: snapshot.slots.filter((s) => s.free).length,
            slots: snapshot.slots,
        };

        await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
        this.logger.info('Snapshot saved', {
            locationName: snapshot.locationName,
        });
    }

    private getFilename(locationName: string): string {
        const safe = locationName.replace(/[/\\?%*:|"<>]/g, '_').trim();
        return path.join(this.snapshotsDir, `${safe}.json`);
    }
}
