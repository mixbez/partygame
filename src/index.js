import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Telegraf } from 'telegraf';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { initDb, closeDb } from './db/index.js';
import { initRedis, closeRedis } from './redis/index.js';
import { startBot } from './bot/index.js';
import { setupLobbiesRoutes } from './api/lobbies.js';
import { setupFactsRoutes } from './api/facts.js';
import { setupGameRoutes } from './api/game.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

let bot;

// Health check endpoint
app.get('/health', async (request, reply) => {
  return { status: 'ok', service: 'partygame' };
});

// Telegram webhook endpoint
app.post('/pg-webhook', async (request, reply) => {
  try {
    const updateId = request.body?.update_id;
    const hasMessage = !!request.body?.message;
    const messageText = request.body?.message?.text;
    console.log(`📨 Webhook #${updateId}: message="${messageText}" (hasMessage=${hasMessage})`);
    await bot.handleUpdate(request.body);
  } catch (error) {
    console.error('❌ Webhook error:', error.message, error.stack);
  }
  return { ok: true };
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n📍 Received ${signal}, shutting down gracefully...`);
  try {
    await app.close();
    await closeDb();
    await closeRedis();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  try {
    console.log('🚀 Starting Party Game Bot...');

    // Initialize services
    console.log('📡 Initializing services...');
    await initDb();
    await initRedis();
    console.log('✅ Services initialized');

    // Initialize bot
    console.log('🤖 Initializing Telegram bot...');
    bot = new Telegraf(process.env.PARTYGAME_BOT_TOKEN);
    await startBot(bot);
    console.log('✅ Bot initialized');

    // Serve frontend static files at /game
    await app.register(fastifyStatic, {
      root: join(__dirname, '../frontend-dist'),
      prefix: '/game/',
      index: 'index.html',
    });
    // Serve index.html for /game (without trailing slash, query params preserved)
    app.get('/game', (req, reply) => reply.sendFile('index.html'));

    // Register API routes
    console.log('📍 Registering API routes...');
    await setupLobbiesRoutes(app);
    await setupFactsRoutes(app);
    await setupGameRoutes(app);
    console.log('✅ API routes registered');

    // Set webhook in production
    if (process.env.NODE_ENV === 'production' && process.env.BOT_WEBHOOK_URL) {
      console.log(`🔗 Setting webhook to ${process.env.BOT_WEBHOOK_URL}/pg-webhook`);
      await bot.telegram.setWebhook(`${process.env.BOT_WEBHOOK_URL}/pg-webhook`);
    }

    // Start Fastify server
    const port = parseInt(process.env.PORT || 3002);
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`✅ Server listening on port ${port}`);
    console.log(`📱 Attribution: ${process.env.ATTRIBUTION || 'by aboutmisha.com'}`);
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }
}

start();
