import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

/**
 * Handle /start_game command (only host can do this)
 */
export async function handleStartGame(ctx, lobbyId) {
  const userId = ctx.from.id;
  const db = getDb();

  try {
    // Check if user is host
    const lobbyResult = await db.query(
      'SELECT host_id FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found.');
      return;
    }

    if (lobbyResult.rows[0].host_id !== userId) {
      await ctx.reply('❌ Only the host can start the game.');
      return;
    }

    // Trigger game start via API
    const response = await fetch(
      `http://localhost:${process.env.PORT}/api/partygame/lobbies/${lobbyId}/start`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      await ctx.reply(`❌ ${error.error}`);
      return;
    }

    // Get participants
    const participantsResult = await db.query(
      'SELECT user_id FROM lobby_participants WHERE lobby_id = $1',
      [lobbyId]
    );

    // Notify all participants
    const participants = participantsResult.rows;
    for (const participant of participants) {
      const gameToken = generateToken();
      const gameUrl = `https://v2202504269079335176.supersrv.de/game?lobby=${lobbyId}&player=${participant.user_id}&token=${gameToken}`;

      // Cache token
      await redis.set(
        `game:${lobbyId}:${participant.user_id}:token`,
        gameToken,
        86400
      );

      try {
        await ctx.telegram.sendMessage(
          participant.user_id,
          `🎮 Game Started!\n\nClick the link below to play offline mode:\n\n🔗 Play Game: ${gameUrl}\n\nOr wait for online mode updates in this chat.`
        );
      } catch (err) {
        console.error(`Failed to notify participant ${participant.user_id}:`, err);
      }
    }

    await ctx.reply('✅ Game started! Players have been notified.');
  } catch (error) {
    console.error('❌ Error starting game:', error);
    await ctx.reply('❌ Error starting the game. Please try again.');
  }
}

function generateToken() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/**
 * Get game status update
 */
export async function getGameStatus(ctx, lobbyId) {
  const db = getDb();

  try {
    const lobbyResult = await db.query(
      'SELECT status, created_at FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      return null;
    }

    const lobby = lobbyResult.rows[0];

    const participantsResult = await db.query(
      `SELECT u.first_name, lp.points, lp.nickname
       FROM lobby_participants lp
       LEFT JOIN users u ON lp.user_id = u.id
       WHERE lp.lobby_id = $1
       ORDER BY lp.points DESC`,
      [lobbyId]
    );

    return {
      status: lobby.status,
      participants: participantsResult.rows,
    };
  } catch (error) {
    console.error('❌ Error getting game status:', error);
    return null;
  }
}
