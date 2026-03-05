import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function joinLobbyCommand(ctx) {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('❌ Usage: /join_lobby <lobby_id>\n\nExample: /join_lobby 123');
    return;
  }

  const db = getDb();

  try {
    // Check if lobby exists
    const lobbyResult = await db.query(
      'SELECT id, status FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found. Check the ID and try again.');
      return;
    }

    const lobby = lobbyResult.rows[0];

    if (lobby.status !== 'waiting') {
      await ctx.reply('❌ This lobby is not accepting new players.');
      return;
    }

    // Check if already joined
    const existingResult = await db.query(
      'SELECT id FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2',
      [lobbyId, userId]
    );

    if (existingResult.rows.length > 0) {
      await ctx.reply('✅ You\'re already in this lobby!');
      return;
    }

    // Add user to lobby
    await db.query(
      `INSERT INTO lobby_participants (lobby_id, user_id, ready) VALUES ($1, $2, $3)`,
      [lobbyId, userId, false]
    );

    const message = `
✅ You Joined Lobby ${lobbyId}!

📋 Get ready to play! The host will start the game soon.

⏳ Waiting for other players...

/my_lobbies - View all your lobbies
    `.trim();

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error joining lobby:', error);
    await ctx.reply('❌ Error joining lobby. Try again later.');
  }
}
