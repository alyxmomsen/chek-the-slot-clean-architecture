import { ConfigRepository } from '../ConfigRepository';
import { ILogger } from '../../../application/ports/ILogger';
import fs from 'fs/promises';

jest.mock('fs/promises');

const MockedFs = fs as jest.Mocked<typeof fs>;

describe('ConfigRepository', () => {
    let logger: ILogger;
    let repo: ConfigRepository;

    beforeEach(() => {

        logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };
        repo = new ConfigRepository(logger, '/fake/dir');
        jest.clearAllMocks();
    });

    describe('loadPollInterval', () => {
        it('должен вернуть интервал из корректного файла', async () => {
            MockedFs.readFile.mockResolvedValue(
                JSON.stringify({ pollIntervalMs: 2000 })
            );

            const result = await repo.loadPollInterval();

            expect(result).toBe(2000);
            expect(logger.info).toHaveBeenCalledWith('Config loaded', {
                pollIntervalMs: 2000,
            });
        });

        it('должен вернуть null если файла нет', async () => {
            const err = new Error('ENOENT') as NodeJS.ErrnoException;
            err.code = 'ENOENT';
            MockedFs.readFile.mockRejectedValue(err);

            const result = await repo.loadPollInterval();

            expect(result).toBeNull();
            expect(logger.warn).not.toHaveBeenCalled(); // ENOENT не логируется как warn
        });

        it('должен вернуть null и вызвать warn при повреждённом файле', async () => {
            MockedFs.readFile.mockResolvedValue('not json');

            const result = await repo.loadPollInterval();

            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalled();
        });

        it('должен вернуть null если значение вне диапазона', async () => {
            MockedFs.readFile.mockResolvedValue(
                JSON.stringify({ pollIntervalMs: 10 })
            );

            const result = await repo.loadPollInterval();

            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(
                'Invalid pollIntervalMs in config, using default'
            );
        });
    });

    describe('savePollInterval', () => {
        it('должен сохранить новый интервал в файл', async () => {
            MockedFs.mkdir.mockResolvedValue(undefined);
            MockedFs.writeFile.mockResolvedValue(undefined);

            await repo.savePollInterval(2000);

            expect(MockedFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                JSON.stringify({ pollIntervalMs: 2000 }, null, 2),
                'utf-8'
            );
            expect(logger.info).toHaveBeenCalledWith('Config saved', {
                pollIntervalMs: 2000,
            });
        });
    });
});
