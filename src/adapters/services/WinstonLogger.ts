import winston from 'winston';
import { ILogger } from '../../core/ports/ILogger';

export class WinstonLogger implements ILogger {
    private logger: winston.Logger;

    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({
                    filename: 'logs/error.log',
                    level: 'error',
                }),
                new winston.transports.File({ filename: 'logs/combined.log' }),
            ],
        });
    }

    info(msg: string, ctx?: Record<string, unknown>): void {
        this.logger.info(msg, ctx);
    }

    warn(msg: string, ctx?: Record<string, unknown>): void {
        this.logger.warn(msg, ctx);
    }

    error(msg: string, err?: Error, ctx?: Record<string, unknown>): void {
        this.logger.error(msg, { error: err?.message, ...ctx });
    }

    debug(msg: string, ctx?: Record<string, unknown>): void {
        this.logger.debug(msg, ctx);
    }
}
