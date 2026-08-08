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
    private readonly logFilePath?: string;

    constructor(
        botToken: string,
        private readonly fallbackChatId: string,
        private readonly logger: ILogger,
        bookingPool: IBookingPoolRepository
    ) {
        this.logFilePath = process.env.BOT_TOKEN_DEV ? undefined : 'dev_messages.log';

        this.bot = new Telegraf(botToken);
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.bookingPool = bookingPool;

        // === ЛОГИРОВАНИЕ: регистрируем обработчики ===
        this.logger.info('[TelegramService] Registering bot actions...');

        // Первый шаг – выбор опции
        this.bot.action(/resolve:(.+):(keep|cancel)/, async (ctx) => {
            const recordId = ctx.match[1];
            const action = ctx.match[2];
            this.logger.info('[TelegramService] Resolve action triggered', {
                recordId,
                action,
                from: ctx.from?.username || ctx.from?.first_name,
            });

            try {
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
                this.logger.info(
                    '[TelegramService] Resolve: reply markup updated'
                );
                await ctx.answerCbQuery('Подтвердите действие');
            } catch (e) {
                this.logger.error(
                    '[TelegramService] Resolve action error',
                    e instanceof Error ? e : new Error(String(e))
                );
            }
        });

        // Второй шаг – подтверждение
        this.bot.action(/confirm:(.+):(keep|cancel)/, async (ctx) => {
            const recordId = ctx.match[1];
            const action = ctx.match[2] as 'keep' | 'cancel';
            this.logger.info('[TelegramService] Confirm action triggered', {
                recordId,
                action,
                from: ctx.from?.username || ctx.from?.first_name,
            });

            try {
                // Получаем запись из пула
                const record = await this.bookingPool.get(recordId);
                if (!record) {
                    this.logger.warn(
                        '[TelegramService] Confirm: record not found',
                        { recordId }
                    );
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
                this.logger.info('[TelegramService] Confirm: pool updated');

                // Редактируем сообщение в чате
                const decisionText =
                    action === 'keep' ? 'оставить' : 'отменить';
                await ctx.editMessageText(
                    `🎯 Бронь: ${record.locationName}, ${record.date} ${record.time}\n` +
                        `✅ Решение: ${decisionText} (${ctx.from?.username || ctx.from?.first_name})`
                );
                this.logger.info('[TelegramService] Confirm: message edited');

                // Открепляем сообщение после решения
                try {
                    await this.bot.telegram.unpinChatMessage(
                        record.chatId,
                        ctx.update.callback_query.message?.message_id
                    );
                    this.logger.info(
                        '[TelegramService] Confirm: message unpinned'
                    );
                } catch (e) {
                    this.logger.warn(
                        '[TelegramService] Confirm: unpin failed',
                        {
                            error: (e as Error).message,
                        }
                    );
                }

                await ctx.answerCbQuery('Решение принято');
            } catch (e) {
                this.logger.error(
                    '[TelegramService] Confirm action error',
                    e instanceof Error ? e : new Error(String(e))
                );
            }
        });

        // Первый шаг – нажатие на кнопку «Обработать бронь»
        this.bot.action(/booking:(.+)/, async (ctx) => {
            const recordId = ctx.match[1];
            this.logger.info('[TelegramService] Booking action triggered', {
                recordId,
            });

            try {
                const record = await this.bookingPool.get(recordId);
                if (!record) {
                    await ctx.answerCbQuery('Запись не найдена');
                    return;
                }

                // Меняем кнопку «Обработать бронь» на «Оставить» и «Отменить»
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: [
                        [
                            {
                                text: '✅ Оставить',
                                callback_data: `resolve:${recordId}:keep`,
                            },
                            {
                                text: '❌ Отменить',
                                callback_data: `resolve:${recordId}:cancel`,
                            },
                        ],
                    ],
                });
                this.logger.info(
                    '[TelegramService] Booking: reply markup updated'
                );
                await ctx.answerCbQuery();
            } catch (e) {
                this.logger.error(
                    '[TelegramService] Booking action error',
                    e instanceof Error ? e : new Error(String(e))
                );
            }
        });

        this.logger.info('[TelegramService] Bot actions registered');
    }

    /** Запускает polling бота для приёма callback'ов */
    async launch(): Promise<void> {
        this.logger.info('[TelegramService] launch() called', {
            isDevelopment: this.isDevelopment,
        });

        // if (this.isDevelopment) {
        //     this.logger.info('[TelegramService] Skipping bot polling (development mode)');
        //     return;
        // }

        this.logger.info('[TelegramService] Starting bot polling...');
        // Запускаем без await, чтобы не блокировать
        this.bot
            .launch()
            .then(() => {
                this.logger.info(
                    '[TelegramService] Bot polling started successfully'
                );
            })
            .catch((err) => {
                this.logger.error(
                    '[TelegramService] Bot polling failed',
                    err instanceof Error ? err : new Error(String(err))
                );
            });
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

        this.logger.info('[TelegramService] sendBookingResult', {
            targetChatId,
            callbackData,
        });

        if (this.isDevelopment) {
            // Если задан dev-токен — отправляем реально (в тестовый чат)
            // Иначе — пишем в файл
            if (!process.env.BOT_TOKEN_DEV) {
                const fs = require('fs');
                const logLine = `[${new Date().toISOString()}] TO: ${chatId} | ${text}\n`;
                fs.appendFileSync('dev_messages.log', logLine);
                this.logger.info('Dev mode: message saved to dev_messages.log');
                return;
            }
            // Если BOT_TOKEN_DEV задан, продолжаем реальную отправку
        }

        try {
            const sent = await this.bot.telegram.sendMessage(
                targetChatId,
                text,
                {
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
                }
            );
            this.logger.info('[TelegramService] Booking message sent', {
                messageId: sent.message_id,
            });

            // Закрепляем сообщение
            try {
                await this.bot.telegram.pinChatMessage(
                    targetChatId,
                    sent.message_id,
                    { disable_notification: true }
                );
                this.logger.info('[TelegramService] Booking message pinned');
            } catch (e) {
                this.logger.warn('[TelegramService] Pin failed', {
                    error: (e as Error).message,
                });
            }
        } catch (e) {
            this.logger.error(
                '[TelegramService] sendBookingResult error',
                e instanceof Error ? e : new Error(String(e))
            );
        }
    }

    // В методе send:
    private async send(chatId: string, text: string): Promise<void> {
        if (this.isDevelopment) {
            // Если задан dev-токен — отправляем реально (в тестовый чат)
            // Иначе — пишем в файл
            if (!process.env.BOT_TOKEN_DEV) {
                const fs = require('fs');
                const logLine = `[${new Date().toISOString()}] TO: ${chatId} | ${text}\n`;
                fs.appendFileSync('dev_messages.log', logLine);
                this.logger.info('Dev mode: message saved to dev_messages.log');
                return;
            }
            // Если BOT_TOKEN_DEV задан, продолжаем реальную отправку
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
