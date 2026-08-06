import winston from 'winston';
import { ILogger } from '../../application/ports/ILogger';

export class WinstonLogger implements ILogger {
  private logger: winston.Logger;

  constructor() {
    const level = process.env.LOG_LEVEL || 'info';

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const ctx = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctx}`;
        }),
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
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