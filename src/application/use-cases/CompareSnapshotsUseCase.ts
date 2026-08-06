import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';
import { Snapshot } from '../../domain/entities/Snapshot';
import { ISnapshotRepository } from '../ports/ISnapshotRepository';

export class CompareSnapshotsUseCase {
    constructor(private readonly snapshotRepo: ISnapshotRepository) {}

    async execute(
        locationName: string,
        currentSlots: Slot[]
    ): Promise<SlotChange[]> {
        const oldSnapshot = await this.snapshotRepo.load(locationName);
        if (!oldSnapshot) {
            return []; // первый запуск — не с чем сравнивать
        }

        return this.diff(oldSnapshot.slots, currentSlots);
    }

    private diff(oldSlots: Slot[], newSlots: Slot[]): SlotChange[] {
        const oldMap = new Map<string, Slot>();
        for (const slot of oldSlots) {
            oldMap.set(`${slot.date}|${slot.time}`, slot);
        }

        const changes: SlotChange[] = [];

        for (const newSlot of newSlots) {
            const key = `${newSlot.date}|${newSlot.time}`;
            const oldSlot = oldMap.get(key);

            if (!oldSlot) {
                if (!newSlot.free) {
                    changes.push({
                        date: newSlot.date,
                        time: newSlot.time,
                        change: 'занялся',
                        artist: newSlot.artist ?? undefined,
                    });
                }
            } else if (
                oldSlot.free !== newSlot.free ||
                oldSlot.artist !== newSlot.artist
            ) {
                if (oldSlot.free && !newSlot.free) {
                    changes.push({
                        date: newSlot.date,
                        time: newSlot.time,
                        change: 'занялся',
                        artist: newSlot.artist ?? undefined,
                    });
                } else if (!oldSlot.free && newSlot.free) {
                    changes.push({
                        date: newSlot.date,
                        time: newSlot.time,
                        change: 'освободился',
                    });
                } else if (oldSlot.artist !== newSlot.artist) {
                    changes.push({
                        date: newSlot.date,
                        time: newSlot.time,
                        change: 'сменился артист',
                        artist: newSlot.artist ?? undefined,
                        previousArtist: oldSlot.artist ?? undefined,
                    });
                }
            }

            oldMap.delete(key);
        }

        // Оставшиеся в oldMap — исчезли (маловероятно)
        for (const [, oldSlot] of oldMap) {
            if (!oldSlot.free) {
                changes.push({
                    date: oldSlot.date,
                    time: oldSlot.time,
                    change: 'освободился',
                });
            }
        }

        return changes;
    }
}
