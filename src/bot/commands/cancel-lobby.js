import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function cancelLobbyCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /cancel_lobby <lobby_id>\n\nExample: /cancel_lobby 3');
    return;
  }

  const userId = ctx.from.id;
  const db = getDb();

  console.log(`🔍 cancel_lobby: userId=${userId}, lobbyId=${lobbyId}`);

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
    const hostId = Number(lobby.host_id);
    console.log(`🔍 Lobby found: host_id=${hostId}, userId=${userId}, match=${hostId === userId}`);

    if (hostId !== userId) {
      await ctx.reply(`❌ Only the host can cancel the lobby. (You: ${userId}, Host: ${lobby.host_id})`);
      return;
    }

    if (lobby.status === 'finished') {
      await ctx.reply('❌ Game is already finished. Can\'t cancel.');
      return;
    }

    // Delete lobby
    await db.query(
      'DELETE FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    // Clear Redis cache
    await redis.del(`lobby:${lobbyId}`);
    await redis.del(`lobby:${lobbyId}:nicknames`);

    await ctx.reply(`✅ Lobby #${lobbyId} cancelled and deleted.`);
  } catch (error) {
    console.error('❌ Error cancelling lobby:', error);
    await ctx.reply('❌ Error cancelling the lobby. Try again later.');
  }
}
