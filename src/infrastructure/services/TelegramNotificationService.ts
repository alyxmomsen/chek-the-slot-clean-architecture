// src/infrastructure/services/TelegramNotificationService.ts

import { Telegraf } from 'telegraf';
import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';
import {
    BookingRecord,
    IBookingPoolRepository,
} from '../../application/ports/IBookingPoolRepository';
import { INotificationService } from '../../application/ports/INotificationService';
import { ILogger } from '../../application/ports/ILogger';

export class TelegramNotificationService implements INotificationService {
    private readonly bot: Telegraf;
    private readonly isDevelopment: boolean;
    private readonly bookingPool: IBookingPoolRepository;

    constructor(
        botToken: string,
        private readonly fallbackChatId: string,
        private readonly logger: ILogger,
        bookingPool: IBookingPoolRepository
    ) {
        this.bot = new Telegraf(botToken);
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.bookingPool = bookingPool;

        // Первый шаг – выбор опции
        this.bot.action(/resolve:(.+):(keep|cancel)/, async (ctx) => {
            const recordId = ctx.match[1];
            const action = ctx.match[2];

            await ctx.editMessageReplyMarkup({
                inline_keyboard: [
                    [
                        {
                            text:
                                action === 'keep'
                                    ? '✅ Точно оставить'
                                    : '❌ Точно отменить',
                            callback_data: `confirm:${recordId}:${action}`,
                        },
                    ],
                ],
            });
            await ctx.answerCbQuery('Подтвердите действие');
        });

        // Второй шаг – подтверждение
        this.bot.action(/confirm:(.+):(keep|cancel)/, async (ctx) => {
            const recordId = ctx.match[1];
            const action = ctx.match[2] as 'keep' | 'cancel';

            // Получаем запись из пула
            const record = await this.bookingPool.get(recordId);
            if (!record) {
                await ctx.answerCbQuery('Запись не найдена');
                return;
            }

            // Обновляем запись в пуле
            await this.bookingPool.update(recordId, {
                status: 'resolved',
                resolution: action,
                resolvedBy:
                    ctx.from?.username || ctx.from?.first_name || 'unknown',
                resolvedAt: new Date().toISOString(),
            });

            // Редактируем сообщение в чате
            const decisionText = action === 'keep' ? 'оставить' : 'отменить';
            await ctx.editMessageText(
                `🎯 Бронь: ${record.locationName}, ${record.date} ${record.time}\n` +
                    `✅ Решение: ${decisionText} (${ctx.from?.username || ctx.from?.first_name})`
            );

            // Открепляем сообщение после решения
            try {
                await this.bot.telegram.unpinChatMessage(
                    record.chatId,
                    ctx.update.callback_query.message?.message_id
                );
            } catch (e) {
                this.logger.warn('Не удалось открепить сообщение', {
                    error: (e as Error).message,
                });
            }

            await ctx.answerCbQuery('Решение принято');
        });
    }

    /** Запускает polling бота для приёма callback'ов */
    async launch(): Promise<void> {
    if (!this.isDevelopment) {
            this.bot.launch().then(() => {
                this.logger.info('Telegram bot polling started');
            }).catch(err => {
                this.logger.error('Failed to launch bot', err instanceof Error ? err : new Error(String(err)));
            });
        }
    }

    async sendNotification(options: {
        address: string;
        changes: SlotChange[];
        chatId: string;
    }): Promise<void> {
        const { address, changes, chatId } = options;
        const targetChatId = chatId || this.fallbackChatId;

        if (!changes || changes.length === 0) return;

        const lines = [`📍 *${address}* — изменения:`];
        changes.forEach((c) => {
            if (c.change === 'освободился') {
                lines.push(`🟢 ${c.date} ${c.time} — освободился`);
            } else if (c.change === 'занялся') {
                lines.push(
                    `🔴 ${c.date} ${c.time} — занялся${c.artist ? ' → _' + c.artist + '_' : ''}`
                );
            } else if (c.change === 'сменился артист') {
                lines.push(
                    `🔄 ${c.date} ${c.time} — сменился артист → _${c.artist}_`
                );
            }
        });

        const text = lines.join('\n');
        await this.send(targetChatId, text);
    }

    async sendSummary(options: {
        address: string;
        chatId: string;
        slots: Slot[];
        isFirstRun: boolean;
    }): Promise<void> {
        const { address, chatId, slots, isFirstRun } = options;
        const targetChatId = chatId || this.fallbackChatId;

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
        const lines = [`${prefix} *${address}* — сводка`];

        if (freeByDate.size > 0) {
            lines.push('🟢 Свободно:');
            lines.push(format(freeByDate));
        }
        if (occupiedByDate.size > 0) {
            lines.push('🔴 Занято:');
            lines.push(format(occupiedByDate));
        }

        const text = lines.join('\n');
        await this.send(targetChatId, text);
    }

    /**
     * Отправляет сообщение о бронировании с кнопкой «Обработать бронь» и закрепляет его.
     */
    async sendBookingResult(options: {
        address: string;
        chatId: string;
        record: BookingRecord;
    }): Promise<void> {
        const { address, chatId, record } = options;
        const targetChatId = chatId || this.fallbackChatId;
        const text = `🎯 Бронь: ${address}, ${record.date} ${record.time}`;
        const callbackData = `booking:${record.id}`;

        if (this.isDevelopment) {
            this.logger.info('Dev mode: booking result not sent', {
                chatId: targetChatId,
                text,
            });
            return;
        }

        const sent = await this.bot.telegram.sendMessage(targetChatId, text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '⚙️ Обработать бронь',
                            callback_data: callbackData,
                        },
                    ],
                ],
            },
        });

        // Закрепляем сообщение
        try {
            await this.bot.telegram.pinChatMessage(
                targetChatId,
                sent.message_id,
                { disable_notification: true }
            );
        } catch (e) {
            this.logger.warn('Не удалось закрепить сообщение', {
                error: (e as Error).message,
            });
        }
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
