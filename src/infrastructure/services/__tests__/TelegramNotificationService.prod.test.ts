import { TelegramNotificationService } from '../TelegramNotificationService';
import { IBookingPoolRepository } from '../../../application/ports/IBookingPoolRepository';

// Мокаем Telegraf
jest.mock('telegraf', () => {
    const mockSendMessage = jest.fn().mockResolvedValue({ message_id: 123 });
    const mockPinChatMessage = jest.fn().mockResolvedValue(true);
    const mockUnpinChatMessage = jest.fn().mockResolvedValue(true);
    
    return {
        Telegraf: jest.fn().mockImplementation(() => ({
            telegram: {
                sendMessage: mockSendMessage,
                pinChatMessage: mockPinChatMessage,
                unpinChatMessage: mockUnpinChatMessage,
            },
            action: jest.fn(),
            launch: jest.fn().mockResolvedValue(undefined),
            stop: jest.fn(),
        })),
    };
});

describe('TelegramNotificationService in production mode', () => {
    let service: TelegramNotificationService;
    let mockBookingPool: jest.Mocked<IBookingPoolRepository>;
    let logger: any;

    beforeEach(() => {
        // Устанавливаем NODE_ENV=production
        process.env.NODE_ENV = 'production';
        process.env.BOT_TOKEN = 'test-token';
        
        mockBookingPool = {
            add: jest.fn(),
            update: jest.fn(),
            get: jest.fn(),
            getPendingByAgent: jest.fn(),
        } as any;

        logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        service = new TelegramNotificationService(
            'test-token',
            'fallback-chat',
            logger,
            mockBookingPool
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('должен реально отправлять сообщение в Telegram', async () => {
        const { Telegraf } = require('telegraf');
        const mockInstance = (Telegraf as jest.Mock).mock.results[0].value;
        
        await (service as any).send('-1000000000001', 'Test message');
        
        expect(mockInstance.telegram.sendMessage).toHaveBeenCalledWith(
            '-1000000000001',
            'Test message',
            { parse_mode: 'Markdown' }
        );
    });

    it('НЕ должен писать сообщения в файл', async () => {
        const fs = require('fs');
        const spy = jest.spyOn(fs, 'appendFileSync');
        
        await (service as any).send('-1000000000001', 'Test message');
        
        expect(spy).not.toHaveBeenCalled();
    });
});