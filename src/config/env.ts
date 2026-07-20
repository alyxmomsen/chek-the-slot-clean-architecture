import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
    botToken: process.env.BOT_TOKEN || '',
    fallbackChatId: process.env.CHAT_ID || '',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '1000', 10),
    staleToleranceMs: parseInt(process.env.STALE_TOLERANCE_MS || '5000', 10),
    maxRunHours: parseInt(process.env.MAX_RUN_HOURS || '8', 10),
    snapshotsDir:
        process.env.SNAPSHOTS_DIR || path.join(process.cwd(), 'snapshots'),
};
