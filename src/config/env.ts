import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
    BOT_TOKEN_DEV: z.string().optional(), // необязательный токен для разработки
    CHAT_ID: z.string().min(1, 'CHAT_ID is required'),
    DEV_CHAT_ID: z.string().optional(),
    NODE_ENV: z
        .enum(['development', 'production'])
        .optional()
        .default('production'),
    API_HOST: z.string().optional().default('localhost'),
    API_PORT: z.string().optional().default('3001'),
    WS_PORT: z.string().optional().default('3002'),
    CORS_ORIGIN: z.string().optional().default('*'),
    POLL_INTERVAL_MS: z.string().optional().default('1000'),
    STALE_TOLERANCE_MS: z.string().optional().default('5000'),
    MAX_RUN_HOURS: z.string().optional().default('8'),
    SNAPSHOTS_DIR: z.string().optional(),
    API_TOKEN: z.string().optional().default('change-me'),
    DEBUG: z.string().optional().default('false'),
});

const parsed = envSchema.parse(process.env);

// Если режим разработки, но токен не указан — падаем с понятной ошибкой
if (parsed.NODE_ENV === 'development' && !parsed.BOT_TOKEN_DEV) {
    console.warn('⚠️ BOT_TOKEN_DEV not set. All messages will be saved to dev_messages.log instead of Telegram.');
}

export const config = {
    botToken: parsed.BOT_TOKEN,
    botTokenDev: parsed.BOT_TOKEN_DEV || undefined, // undefined, если не задан
    devChatId:parsed.DEV_CHAT_ID || undefined, // bottle neck. временное решение
    fallbackChatId: parsed.CHAT_ID,
    nodeEnv: parsed.NODE_ENV,
    apiHost: parsed.API_HOST,
    apiPort: parseInt(parsed.API_PORT, 10),
    wsPort: parseInt(parsed.WS_PORT, 10),
    corsOrigin: parsed.CORS_ORIGIN,
    pollIntervalMs: parseInt(parsed.POLL_INTERVAL_MS, 10),
    staleToleranceMs: parseInt(parsed.STALE_TOLERANCE_MS, 10),
    maxRunHours: parseInt(parsed.MAX_RUN_HOURS, 10),
    snapshotsDir: parsed.SNAPSHOTS_DIR || path.join(process.cwd(), 'snapshots'),
    apiToken: parsed.API_TOKEN,
    debug: parsed.DEBUG === 'true',
};