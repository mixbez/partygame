import { getDb } from '../../db/index.js';
import { handleStartGame } from '../handlers/game-flow.js';

export async function startGameCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /start_game <lobby_id>\n\nExample: /start_game 3');
    return;
  }

  const userId = ctx.from.id;
  const db = getDb();

  try {
    // Check if user is host
    const lobbyResult = await db.query(
      'SELECT host_id, status FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found.');
      return;
    }

    const lobby = lobbyResult.rows[0];

    if (Number(lobby.host_id) !== userId) {
      await ctx.reply('❌ Only the host can start the game.');
      return;
    }

    if (lobby.status !== 'waiting') {
      await ctx.reply(`❌ Game is already ${lobby.status}. Can't start again.`);
      return;
    }

    // Get participants
    const participantsResult = await db.query(
      'SELECT user_id FROM lobby_participants WHERE lobby_id = $1',
      [lobbyId]
    );

    const participants = participantsResult.rows.map(r => r.user_id);

    if (participants.length < 2) {
      await ctx.reply('❌ Need at least 2 players to start the game.');
      return;
    }

    // Call the game start logic
    await handleStartGame(ctx, lobbyId);

    await ctx.reply(`✅ Game #${lobbyId} started!\n\nNotifying all ${participants.length} players...`);
  } catch (error) {
    console.error('❌ Error starting game:', error);
    await ctx.reply('❌ Error starting the game. Try again later.');
  }
}
