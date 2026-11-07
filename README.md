# Slot Checker

Сервис мониторинга слотов на площадках фестиваля «Уличный музыкант». Отслеживает расписание, сравнивает состояние с предыдущим снапшотом и отправляет уведомления в Telegram. Дополнительно принимает отчёты от агентов бронирования и предоставляет HTTP API для дашборда.

Проект написан на TypeScript с использованием Clean Architecture: бизнес-логика отделена от фреймворков, хранилищ и Telegram.

## Возможности

- Мониторинг нескольких площадок с настраиваемым интервалом опроса.
- Сравнение слотов со снапшотом: `освободился`, `занялся`, `сменился артист`.
- Уведомления в Telegram с маршрутизацией по чатам.
- Часовые сводки с полным состоянием слотов.
- Расписание интервалов: ночной турбо-режим, утренний, дневной.
- Приём отчётов от агентов бронирования и обработка решений через Telegram inline-кнопки.
- HTTP API для дашборда: REST, SSE, WebSocket.
- Dev/Prod режимы: отдельный бот для разработки, запись сообщений в файл при отсутствии dev-токена.

## Архитектура

Clean Architecture, слои и направление зависимостей:

```
Presentation → Application → Domain
Infrastructure → Application → Domain
```

- **Domain** — сущности `Slot`, `Snapshot`, `SlotChange`, `PollingSchedule`.
- **Application** — сценарии (`MonitorSlotsUseCase`, `CompareSnapshotsUseCase`, `GenerateSummaryUseCase`, `DetectStalenessUseCase`) и порты.
- **Infrastructure** — реализации портов: API-клиент, файловые репозитории, Telegram, Winston, EventBus.
- **Presentation** — Express, WebSocket, контроллеры.
- **Composition Root** — `src/main.ts`.

## Технологии

| Слой | Технология |
|---|---|
| Язык | TypeScript 5.6 |
| Runtime | Node.js 22+ |
| HTTP | Express |
| WebSocket | `ws` |
| Telegram | `telegraf` |
| Валидация | `zod` |
| Логирование | `winston` |
| Тесты | `jest`, `@swc/jest`, `supertest` |

## Структура

```
src/
├── domain/entities/           # Slot, Snapshot, SlotChange, PollingSchedule
├── application/
│   ├── ports/                 # интерфейсы для внешнего мира
│   └── use-cases/             # сценарии
├── infrastructure/
│   ├── repositories/          # файловые хранилища
│   └── services/              # API-клиент, Telegram, Winston, EventBus
├── presentation/
│   ├── controllers/
│   └── server.ts
├── config/env.ts
└── main.ts
```

## Быстрый старт

```bash
git clone <repo-url>
cd slot-checker
npm install
cp .env.example .env   # если есть; иначе создай вручную
npx tsc
node dist/main.js
```

### Минимальный `.env`

```env
BOT_TOKEN=123456:AAA...
CHAT_ID=-100...
NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=3001
WS_PORT=3002
API_TOKEN=change-me
POLL_INTERVAL_MS=5000
```

**Важно:** `chatId` площадок задаются в `src/main.ts` в массиве `locations`. В публичной версии там стоят заглушки `-1000000000001`. Для запуска замени их на реальные ID своих групп.

### Проверка

```bash
curl http://127.0.0.1:3001/health
```

## API

Базовый URL локально: `http://127.0.0.1:3001`.

| Эндпоинт | Метод | Назначение |
|---|---|---|
| `/health` | GET | Health-check |
| `/status` | GET | Все площадки |
| `/status/:name` | GET | Конкретная площадка |
| `/locations` | GET | Список площадок |
| `/events` | GET | SSE |
| `/booking-result` | POST | Отчёт агента бронирования |
| `/pending-actions/:agentId` | GET | Ожидающие действия агента |
| `/booking-action-complete` | POST | Подтверждение выполнения |
| `/report` | POST | Отчёт подчинённого поллера |
| `/config` | PATCH | Смена интервала опроса |
| `/ws` (порт 3002) | WS | WebSocket |

Эндпоинты `POST /booking-result`, `GET /pending-actions`, `POST /booking-action-complete`, `POST /report`, `PATCH /config` требуют `Authorization: Bearer <API_TOKEN>`.

## Telegram: обработка бронирований

1. Агент отправляет `POST /booking-result`.
2. Сервис создаёт запись в пуле и отправляет сообщение с кнопкой «Обработать бронь».
3. Пользователь нажимает кнопку → появляются «Оставить» / «Отменить».
4. После выбора — подтверждение.
5. Запись переходит в `resolved`, сообщение редактируется и открепляется.
6. Агент забирает действие через `GET /pending-actions/:agentId`.

## Расписание опросов

Файл `configs/schedule.json` задаёт интервалы:

```json
{
  "intervals": [
    { "id": "turbo-night", "start": "23:55", "end": "00:59", "pollIntervalMs": 900, "endOffsetDays": 1 },
    { "id": "daytime", "start": "04:00", "end": "23:54", "pollIntervalMs": 5000, "endOffsetDays": 0 }
  ]
}
```

Приоритет источников: `schedule.json` → `configs/config.json` → `POLL_INTERVAL_MS`.

## Dev и Prod режимы

| Аспект | development | production |
|---|---|---|
| Токен бота | `BOT_TOKEN_DEV`, если задан | `BOT_TOKEN` |
| Отправка в Telegram | Реальная при наличии `BOT_TOKEN_DEV`, иначе запись в `logs/dev_messages.log` | Реальная |
| Polling бота | Запускается всегда | Запускается всегда |

## Тесты

```bash
npx jest
```

Покрыто: `ConfigRepository`, `MonitorSlotsUseCase.setPollInterval`, `PATCH /config`, `TelegramNotificationService` в prod-режиме.

## Лицензия

MIT