import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function cancelLobbyCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /cancel_lobby <lobby_id>\nExample: /cancel_lobby 3');
    return;
  }

  const userId = ctx.from.id;
  const db = getDb();

  try {
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
      await ctx.reply('❌ Only the host can cancel the lobby.');
      return;
    }

    if (lobby.status === 'finished') {
      await ctx.reply('❌ Game is already finished.');
      return;
    }

    await db.query('DELETE FROM lobbies WHERE id = $1', [lobbyId]);
    await redis.del(`lobby:${lobbyId}`);

    await ctx.reply(
      `✅ Lobby #${lobbyId} cancelled.\n\n` +
      `/create_lobby — create a new lobby\n` +
      `/my_lobbies — view your lobbies`
    );
  } catch (error) {
    console.error('❌ Error cancelling lobby:', error);
    await ctx.reply('❌ Error cancelling the lobby. Try again later.');
  }
}
