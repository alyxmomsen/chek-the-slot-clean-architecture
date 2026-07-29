import { Slot } from '../../domain/entities/Slot';

export class GenerateSummaryUseCase {
    execute(slots: Slot[]): {
        freeByDate: Map<string, string[]>;
        occupiedByDate: Map<string, string[]>;
    } {
        const freeByDate = new Map<string, string[]>();
        const occupiedByDate = new Map<string, string[]>();

        for (const slot of slots) {
            const date = slot.date.slice(5); // "07-20"
            const map = slot.free ? freeByDate : occupiedByDate;
            if (!map.has(date)) map.set(date, []);
            map.get(date)!.push(slot.time);
        }

        return { freeByDate, occupiedByDate };
    }
}
