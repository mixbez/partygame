import { getDb } from '../../db/index.js';

export async function leaveLobbyCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /leave_lobby <lobby_id>\nExample: /leave_lobby 5');
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

    if (Number(lobby.host_id) === userId) {
      await ctx.reply('❌ You are the host. Use /cancel_lobby to cancel the lobby instead.');
      return;
    }

    if (lobby.status !== 'waiting') {
      await ctx.reply('❌ Cannot leave a lobby that has already started.');
      return;
    }

    const result = await db.query(
      'DELETE FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2 RETURNING id',
      [lobbyId, userId]
    );

    if (result.rows.length === 0) {
      await ctx.reply('❌ You are not in this lobby.');
      return;
    }

    await ctx.reply(
      `✅ You left lobby #${lobbyId}.\n\n` +
      `/my_lobbies — view your lobbies\n` +
      `/create_lobby — create a new lobby`
    );
  } catch (error) {
    console.error('❌ Error leaving lobby:', error);
    await ctx.reply('❌ Error leaving lobby. Try again later.');
  }
}
