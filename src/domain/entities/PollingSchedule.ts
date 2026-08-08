// src/domain/entities/PollingSchedule.ts

export interface PollingInterval {
    id: string; // уникальный идентификатор интервала
    start: string; // "HH:mm" (например, "23:45")
    end: string; // "HH:mm" (например, "04:00")
    pollIntervalMs: number; // интервал опроса в мс
    endOffsetDays?: number; // смещение в днях для end (0 — сегодня, 1 — завтра)
}

export class PollingSchedule {
    constructor(public readonly intervals: PollingInterval[]) {}

    /**
     * Проверяет массив интервалов на коллизии.
     * Выбрасывает ошибку, если есть пересечения.
     */
    static validate(intervals: PollingInterval[]): void {
        for (let i = 0; i < intervals.length; i++) {
            for (let j = i + 1; j < intervals.length; j++) {
                if (PollingSchedule.hasCollision(intervals[i], intervals[j])) {
                    throw new Error(
                        `Collision detected between intervals "${intervals[i].id}" and "${intervals[j].id}"`
                    );
                }
            }
        }
    }

    /**
     * Возвращает активный интервал для заданного времени или null.
     * @param now - текущее время (Date)
     */
    getActiveInterval(now: Date): PollingInterval | null {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (const interval of this.intervals) {
            const startMinutes = this.parseTime(interval.start);
            let endMinutes = this.parseTime(interval.end);

            // Если end < start, значит интервал переходит через полночь
            if (endMinutes < startMinutes) {
                endMinutes += 24 * 60;
            }

            const current =
                currentMinutes < startMinutes
                    ? currentMinutes + 24 * 60
                    : currentMinutes;

            if (current >= startMinutes && current < endMinutes) {
                return interval;
            }
        }
        return null;
    }

    /**
     * Парсит время из строки "HH:mm" в количество минут от полуночи.
     */
    private parseTime(time: string): number {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * Проверяет коллизию между двумя интервалами.
     */
    private static hasCollision(
        a: PollingInterval,
        b: PollingInterval
    ): boolean {
        const aStart = a.start.split(':').map(Number);
        const aEnd = a.end.split(':').map(Number);
        const bStart = b.start.split(':').map(Number);
        const bEnd = b.end.split(':').map(Number);

        const aStartMin = aStart[0] * 60 + aStart[1];
        let aEndMin = aEnd[0] * 60 + aEnd[1];
        if (aEndMin < aStartMin) aEndMin += 24 * 60;

        const bStartMin = bStart[0] * 60 + bStart[1];
        let bEndMin = bEnd[0] * 60 + bEnd[1];
        if (bEndMin < bStartMin) bEndMin += 24 * 60;

        // Проверяем пересечение с учётом перехода через полночь
        for (let day = 0; day < 2; day++) {
            const aStartShifted = aStartMin + day * 24 * 60;
            const aEndShifted = aEndMin + day * 24 * 60;

            if (aStartShifted < bEndMin && aEndShifted > bStartMin) {
                return true;
            }
        }
        return false;
    }
}
