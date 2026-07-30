import fs from 'fs/promises';
import path from 'path';
import { ILogger } from '../../application/ports/ILogger';

export class ConfigRepository {
  private readonly configPath: string;

  constructor(
    private readonly logger: ILogger,
    configDir?: string
  ) {
    this.configPath = path.join(configDir || process.cwd(), 'config.json');
  }

  /**
   * Загружает текущий интервал опроса из config.json.
   * Если файла нет или значение некорректно — возвращает null.
   */
  async loadPollInterval(): Promise<number | null> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);
      const value = parsed.pollIntervalMs;
      if (typeof value === 'number' && value >= 500 && value <= 60000) {
        this.logger.info('Config loaded', { pollIntervalMs: value });
        return value;
      }
      this.logger.warn('Invalid pollIntervalMs in config, using default');
      return null;
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('Could not read config file, using default', { error: err.message });
      }
      return null;
    }
  }

  /**
   * Сохраняет новый интервал опроса в config.json.
   */
  async savePollInterval(ms: number): Promise<void> {
    const data = { pollIntervalMs: ms };
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.info('Config saved', { pollIntervalMs: ms });
  }
}