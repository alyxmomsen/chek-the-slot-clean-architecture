// src/infrastructure/services/TelegramNotificationService.ts

import path from 'path';
import fs from 'fs';
import { Telegraf } from 'telegraf';
import { Slot } from '../../domain/entities/Slot';
import { SlotChange } from '../../domain/entities/SlotChange';
import {
    BookingRecord,
    IBookingPoolRepository,
} from '../../application/ports/IBookingPoolRepository';
import { ILocationTopicMapRepository } from '../../application/ports/ILocationTopicMapRepository';
import { INotificationService } from '../../application/ports/INotificationService';
import { ILogger } from '../../application/ports/ILogger';

export class TelegramNotificationService implements INotificationService {
    private readonly bot: Telegraf;
    private readonly isDevelopment: boolean;
    private readonly bookingPool: IBookingPoolRepository;
    private readonly topicRepo?: ILocationTopicMapRepository;
    private readonly logsDir?: string;

    constructor(
        botToken: string,
        private readonly fallbackChatId: string,
        private readonly logger: ILogger,
        bookingPool: IBookingPoolRepository,
        logsDir?: string,
        topicRepo?: ILocationTopicMapRepository
    ) {
        this.bot = new Telegraf(botToken);
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.bookingPool = bookingPool;
        this.topicRepo = topicRepo;
        this.logsDir = logsDir;

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
                const record = await this.bookingPool.get(recordId);
                if (!record) {
                    this.logger.warn(
                        '[TelegramService] Confirm: record not found',
                        { recordId }
                    );
                    await ctx.answerCbQuery('Запись не найдена');
                    return;
                }

                await this.bookingPool.update(recordId, {
                    status: 'resolved',
                    resolution: action,
                    resolvedBy:
                        ctx.from?.username || ctx.from?.first_name || 'unknown',
                    resolvedAt: new Date().toISOString(),
                });
                this.logger.info('[TelegramService] Confirm: pool updated');

                const decisionText =
                    action === 'keep' ? 'оставить' : 'отменить';
                await ctx.editMessageText(
                    `🎯 Бронь: ${record.locationName}, ${record.date} ${record.time}\n` +
                        `✅ Решение: ${decisionText} (${ctx.from?.username || ctx.from?.first_name})`
                );
                this.logger.info('[TelegramService] Confirm: message edited');

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
        this.logger.info('[TelegramService] Starting bot polling...');
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
        locationId: number;
    }): Promise<void> {
        const { address, changes, chatId, locationId } = options;
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
        await this.sendToTopicOrChat(
            targetChatId,
            text,
            locationId,
            'changes',
            {
                parse_mode: 'Markdown' as const,
            }
        );
    }

    async sendSummary(options: {
        address: string;
        chatId: string;
        slots: Slot[];
        isFirstRun: boolean;
        locationId: number;
    }): Promise<void> {
        const { address, chatId, slots, isFirstRun, locationId } = options;
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
        await this.sendToTopicOrChat(
            targetChatId,
            text,
            locationId,
            'summary',
            {
                parse_mode: 'Markdown' as const,
            }
        );
    }

    async sendSystemMessage(options: {
        message: string;
        chatId?: string;
        locationId?: number;
    }): Promise<void> {
        const targetChatId = options.chatId || this.fallbackChatId;
        const text = `⚙️ ${options.message}`;

        if (this.isDevelopment) {
            this.logger.info('Dev mode: system message not sent', {
                chatId: targetChatId,
                text,
            });
            return;
        }

        if (options.locationId) {
            await this.sendToTopicOrChat(
                targetChatId,
                text,
                options.locationId,
                'system'
            );
        } else {
            await this.bot.telegram.sendMessage(targetChatId, text, {
                parse_mode: 'Markdown',
            });
        }
    }

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

        if (this.isDevelopment && !process.env.BOT_TOKEN_DEV) {
            const logFile = this.logsDir
                ? path.join(
                      this.logsDir,
                      process.env.TELEGRAM__DEFAULT_DEV_MESSAGE_LOG ||
                          'dev_messages.log'
                  )
                : path.join(
                      process.cwd(),
                      'logs',
                      process.env.TELEGRAM__DEFAULT_DEV_MESSAGE_LOG ||
                          'dev_messages.log'
                  );
            const logLine = `[${new Date().toISOString()}] TO: ${targetChatId} | ${text}\n`;
            fs.appendFileSync(logFile, logLine);
            this.logger.info('Dev mode: booking result saved to file', {
                logFile,
            });
            return;
        }

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '⚙️ Обработать бронь', callback_data: callbackData }],
            ],
        };

        try {
            const sent = await this.sendToTopicOrChat(
                targetChatId,
                text,
                record.locationId,
                'booking',
                { reply_markup: replyMarkup }
            );

            // Закрепляем сообщение (если отправка вернула результат)
            if (sent) {
                try {
                    const topicConfig = this.topicRepo?.getTopic(
                        record.locationId,
                        'booking'
                    );
                    const threadId = topicConfig?.threadId;
                    await (this.bot.telegram as any).pinChatMessage(
                        targetChatId,
                        sent.message_id,
                        {
                            message_thread_id: threadId,
                            disable_notification: true,
                        }
                    );
                    this.logger.info(
                        '[TelegramService] Booking message pinned'
                    );
                } catch (e) {
                    this.logger.warn('[TelegramService] Pin failed', {
                        error: (e as Error).message,
                    });
                }
            }
        } catch (e) {
            this.logger.error(
                '[TelegramService] sendBookingResult error',
                e instanceof Error ? e : new Error(String(e))
            );
        }
    }

    // ==============================
    // Вспомогательные методы
    // ==============================

    /**
     * Отправляет сообщение в топик (если есть) или в общий чат.
     * При отсутствии топика пытается его создать.
     * Возвращает результат sendMessage для дальнейшего использования (закрепление и т.п.).
     */
    private async sendToTopicOrChat(
        chatId: string,
        text: string,
        locationId: number,
        topicName: string,
        options?: { parse_mode?: string; reply_markup?: any }
    ): Promise<any> {
        if (!this.topicRepo) {
            return this.bot.telegram.sendMessage(chatId, text, {
                ...options,
                parse_mode: 'Markdown' as const,
            });
        }

        const topicConfig = this.topicRepo.getTopic(locationId, topicName);
        let threadId = topicConfig?.threadId;

        // 1-я попытка: отправить в существующий топик
        if (threadId) {
            try {
                return await this.bot.telegram.sendMessage(chatId, text, {
                    ...options,
                    parse_mode: 'Markdown' as const,
                    message_thread_id: threadId,
                });
            } catch (err: any) {
                this.logger.warn(
                    'Failed to send to topic, trying to recreate',
                    {
                        threadId,
                        error: err.message,
                    }
                );
                threadId = null;
            }
        }

        // 2-я попытка: создать топик и отправить
        try {
            const { message_thread_id } =
                await this.bot.telegram.createForumTopic(chatId, topicName);
            threadId = message_thread_id;
            await this.topicRepo.updateThreadId(
                locationId,
                topicName,
                threadId
            );
            return await this.bot.telegram.sendMessage(chatId, text, {
                ...options,
                parse_mode: 'Markdown' as const,
                message_thread_id: threadId,
            });
        } catch (err: any) {
            this.logger.error(
                `Failed to create topic ${topicName}, sending to main chat`,
                err
            );
            return this.bot.telegram.sendMessage(chatId, text, {
                ...options,
                parse_mode: 'Markdown' as const,
            });
        }
    }
}
