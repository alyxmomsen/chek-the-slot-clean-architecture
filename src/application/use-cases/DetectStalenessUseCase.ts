export class DetectStalenessUseCase {
    execute(
        lastCheckedAt: string,
        pollIntervalMs: number,
        staleToleranceMs: number
    ): boolean {
        const lastCheck = new Date(lastCheckedAt).getTime();
        const now = Date.now();
        const maxExpected = pollIntervalMs + staleToleranceMs;
        return now - lastCheck > maxExpected;
    }
}
