import { Request, Response } from 'express';

interface HealthStatus {
    status: 'ok' | 'degraded';
    uptime: number;
    startedAt: string;
    lastReportAt: string | null;
    reportsProcessed: number;
}

export class HealthController {
    private readonly startedAt: string;
    private lastReportAt: string | null = null;
    private reportsProcessed = 0;

    constructor() {
        this.startedAt = new Date().toISOString();
    }

    recordReport(): void {
        this.lastReportAt = new Date().toISOString();
        this.reportsProcessed++;
    }

    handle(_req: Request, res: Response): void {
        const status: HealthStatus = {
            status: 'ok',
            uptime: Math.floor(
                (Date.now() - new Date(this.startedAt).getTime()) / 1000
            ),
            startedAt: this.startedAt,
            lastReportAt: this.lastReportAt,
            reportsProcessed: this.reportsProcessed,
        };

        res.json(status);
    }
}
