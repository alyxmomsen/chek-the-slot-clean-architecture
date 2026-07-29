import { Telegraf } from 'telegraf';
import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';
import { INotificationService } from '../../application/ports/INotificationService';
import { ILogger } from '../../application/ports/ILogger';

export class TelegramNotificationService implements INotificationService {
    private readonly bot: Telegraf;
    private readonly isDevelopment: boolean;

    constructor(
        botToken: string,
        private readonly fallbackChatId: string,
        private readonly logger: ILogger
    ) {
        this.bot = new Telegraf(botToken);
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }

    async sendChanges(
        locationName: string,
        chatId: string,
        changes: SlotChange[]
    ): Promise<void> {
        const lines = [`📍 *${locationName}* — изменения:`];

        for (const c of changes) {
            if (c.change === 'освободился') {
                lines.push(`🟢 ${c.date} ${c.time} — освободился`);
            } else if (c.change === 'занялся') {
                lines.push(
                    `🔴 ${c.date} ${c.time} — занялся${c.artist ? ' → _' + c.artist + '_' : ''}`
                );
            } else if (c.change === 'сменился артист') {
                lines.push(
                    `🔄 ${c.date} ${c.time} — сменился артист${c.artist ? ' → _' + c.artist + '_' : ''}`
                );
            }
        }

        const text = lines.join('\n');
        await this.send(chatId, text);
    }

    async sendSummary(
        locationName: string,
        chatId: string,
        slots: Slot[],
        isFirstRun: boolean
    ): Promise<void> {
        const freeByDate = new Map<string, string[]>();
        const occupiedByDate = new Map<string, string[]>();

        for (const slot of slots) {
            const date = slot.date.slice(5);
            const map = slot.free ? freeByDate : occupiedByDate;
            if (!map.has(date)) map.set(date, []);
            map.get(date)!.push(slot.time);
        }

        const format = (map: Map<string, string[]>) =>
            [...map.entries()]
                .sort()
                .map(([date, times]) => `  ${date}: ${times.join(', ')}`)
                .join('\n');

        const prefix = isFirstRun ? '📍 *ПЕРВЫЙ ЗАПУСК*' : '📍';
        const lines = [`${prefix} *${locationName}* — сводка`];

        if (freeByDate.size > 0) {
            lines.push('🟢 Свободно:');
            lines.push(format(freeByDate));
        }
        if (occupiedByDate.size > 0) {
            lines.push('🔴 Занято:');
            lines.push(format(occupiedByDate));
        }

        const text = lines.join('\n');
        await this.send(chatId, text);
    }

    private async send(chatId: string, text: string): Promise<void> {
        if (this.isDevelopment) {
            this.logger.info('Dev mode: message not sent', {
                chatId,
                text: text.slice(0, 100),
            });
            return;
        }

        try {
            await this.bot.telegram.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
            });
            this.logger.info('Message sent to Telegram', { chatId });
        } catch (err) {
            this.logger.error(
                'Failed to send Telegram message',
                err instanceof Error ? err : new Error(String(err)),
                { chatId }
            );
        }
    }
}
