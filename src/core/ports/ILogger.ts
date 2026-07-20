export interface ILogger {
    info(msg: string, ctx?: Record<string, unknown>): void;
    warn(msg: string, ctx?: Record<string, unknown>): void;
    error(msg: string, err?: Error, ctx?: Record<string, unknown>): void;
}
