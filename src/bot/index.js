import { getDb } from '../db/index.js';
import { redis } from '../redis/index.js';
import { startCommand } from './commands/start.js';
import { myFactsCommand } from './commands/my-facts.js';
import { createLobbyCommand } from './commands/create-lobby.js';
import { joinLobbyCommand } from './commands/join-lobby.js';
import { myLobbiesCommand } from './commands/my-lobbies.js';
import { helpCommand } from './commands/help.js';
import { startGameCommand } from './commands/start-game.js';
import { cancelLobbyCommand } from './commands/cancel-lobby.js';
import { lobbyStatusCommand } from './commands/lobby-status.js';
import { editLobbyCommand } from './commands/edit-lobby.js';
import { endGameCommand } from './commands/end-game.js';
import { handleFactInput } from './handlers/fact-input.js';

export async function startBot(bot) {
  const attribution = process.env.ATTRIBUTION || 'by aboutmisha.com';

  // Middleware FIRST - ensure user exists in database
  bot.use(async (ctx, next) => {
    try {
      if (ctx.from) {
        const db = getDb();
        await db.query(
          `INSERT INTO users (id, username, first_name) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [ctx.from.id, ctx.from.username, ctx.from.first_name]
        );
      }
    } catch (error) {
      console.error('❌ Middleware error:', error.message);
    }
    await next();
  });

  // Register commands AFTER middleware
  bot.command('start', (ctx) => startCommand(ctx, attribution));
  bot.command('my_facts', (ctx) => myFactsCommand(ctx));
  bot.command('create_lobby', (ctx) => createLobbyCommand(ctx));
  bot.command('join_lobby', (ctx) => joinLobbyCommand(ctx));
  bot.command('my_lobbies', (ctx) => myLobbiesCommand(ctx));
  bot.command('help', (ctx) => helpCommand(ctx, attribution));
  bot.command('start_game', (ctx) => startGameCommand(ctx));
  bot.command('cancel_lobby', (ctx) => cancelLobbyCommand(ctx));
  bot.command('lobby_status', (ctx) => lobbyStatusCommand(ctx));
  bot.command('edit_lobby', (ctx) => editLobbyCommand(ctx));
  bot.command('end_game', (ctx) => endGameCommand(ctx));

  // Message handler for text input
  bot.on('message', async (ctx) => {
    // Ignore commands
    if (ctx.message.text?.startsWith('/')) {
      return;
    }

    // Handle fact input
    try {
      await handleFactInput(ctx);
    } catch (error) {
      console.error('❌ Message handler error:', error.message);
    }
  });

  // Callback query handler (inline buttons)
  bot.on('callback_query', async (ctx) => {
    try {
      console.log(`🔘 Callback from ${ctx.from.id}: ${ctx.callbackQuery.data}`);
    } catch (error) {
      console.error('❌ Callback handler error:', error.message);
    }
  });

  // Error handler
  bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    console.error('  Context:', ctx);
  });

  console.log('✅ Bot commands registered');
}
