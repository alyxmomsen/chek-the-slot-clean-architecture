// test-bot.js
require('dotenv').config();
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('BOT_TOKEN is required in .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Ловим ВСЕ callback_query (нажатия на любые inline-кнопки)
bot.on('callback_query', (ctx) => {
    console.log('>>> CALLBACK_QUERY RECEIVED:', ctx.callbackQuery.data);
    ctx.answerCbQuery('Got it!').catch(console.error);
});

// Ловим ЛЮБОЕ текстовое сообщение (для проверки, что бот жив)
bot.on('text', (ctx) => {
    console.log('>>> TEXT RECEIVED:', ctx.message.text);
});

// Запуск polling с подробным логом ошибок
console.log('Starting bot polling...');
bot.launch()
    .then(() => console.log('>>> Bot polling started successfully'))
    .catch(err => console.error('>>> Bot polling failed:', err));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));