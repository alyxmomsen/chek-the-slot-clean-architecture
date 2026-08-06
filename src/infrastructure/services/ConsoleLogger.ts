import { ILogger } from '../../application/ports/ILogger';

export class ConsoleLogger implements ILogger {
    private readonly isDebug: boolean;

    constructor() {
        this.isDebug = process.env.DEBUG === 'true';
    }

    info(msg: string, ctx?: Record<string, unknown>): void {
        const ts = new Date().toISOString();
        const ctxStr = ctx ? ' ' + JSON.stringify(ctx) : '';
        console.log(`[${ts}] [INFO] ${msg}${ctxStr}`);
    }

    warn(msg: string, ctx?: Record<string, unknown>): void {
        const ts = new Date().toISOString();
        const ctxStr = ctx ? ' ' + JSON.stringify(ctx) : '';
        console.warn(`[${ts}] [WARN] ${msg}${ctxStr}`);
    }

    error(msg: string, err?: Error, ctx?: Record<string, unknown>): void {
        const ts = new Date().toISOString();
        const ctxStr = ctx ? ' ' + JSON.stringify(ctx) : '';
        const errStr = err ? ` | ${err.message}` : '';
        console.error(`[${ts}] [ERROR] ${msg}${errStr}${ctxStr}`);
    }

    debug(msg: string, ctx?: Record<string, unknown>): void {
        if (!this.isDebug) return;
        const ts = new Date().toISOString();
        const ctxStr = ctx ? ' ' + JSON.stringify(ctx) : '';
        console.debug(`[${ts}] [DEBUG] ${msg}${ctxStr}`);
    }
}
