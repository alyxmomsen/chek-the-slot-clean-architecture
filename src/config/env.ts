import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
    CHAT_ID: z.string().min(1, 'CHAT_ID is required'),
    POLL_INTERVAL_MS: z.string().optional().default('1000'),
    STALE_TOLERANCE_MS: z.string().optional().default('5000'),
    MAX_RUN_HOURS: z.string().optional().default('8'),
    SNAPSHOTS_DIR: z.string().optional(),
    NODE_ENV: z
        .enum(['development', 'production'])
        .optional()
        .default('production'),
    API_TOKEN: z.string().optional().default('change-me'),
    API_PORT: z.string().optional().default('3001'),
});

const parsed = envSchema.parse(process.env);

export const config = {
    botToken: parsed.BOT_TOKEN,
    fallbackChatId: parsed.CHAT_ID,
    pollIntervalMs: parseInt(parsed.POLL_INTERVAL_MS, 10),
    staleToleranceMs: parseInt(parsed.STALE_TOLERANCE_MS, 10),
    maxRunHours: parseInt(parsed.MAX_RUN_HOURS, 10),
    snapshotsDir: parsed.SNAPSHOTS_DIR || path.join(process.cwd(), 'snapshots'),
    nodeEnv: parsed.NODE_ENV,
    apiToken: parsed.API_TOKEN,
    apiPort: parseInt(parsed.API_PORT, 10),
};
