import { getDb } from '../../db/index.js';

export async function myLobbiesCommand(ctx) {
  const userId = ctx.from.id;
  const db = getDb();

  try {
    // Get hosted lobbies
    const hostedResult = await db.query(
      `SELECT id, status, created_at FROM lobbies
       WHERE host_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get joined lobbies
    const joinedResult = await db.query(
      `SELECT l.id, l.status, l.host_id, l.created_at FROM lobbies l
       INNER JOIN lobby_participants lp ON l.id = lp.lobby_id
       WHERE lp.user_id = $1 AND l.host_id != $2
       ORDER BY l.created_at DESC
       LIMIT 10`,
      [userId, userId]
    );

    let message = '🎮 **Your Lobbies**\n\n';

    if (hostedResult.rows.length === 0 && joinedResult.rows.length === 0) {
      message += '_No active lobbies._\n\n/create_lobby - Create a new game';
    } else {
      if (hostedResult.rows.length > 0) {
        message += '**📍 Hosted by you:**\n';
        hostedResult.rows.forEach((lobby) => {
          const status = lobby.status === 'waiting' ? '⏳' : lobby.status === 'started' ? '🎮' : '✅';
          message += `${status} Lobby #${lobby.id} - ${lobby.status}\n`;
        });
        message += '\n';
      }

      if (joinedResult.rows.length > 0) {
        message += '**🤝 Joined:**\n';
        joinedResult.rows.forEach((lobby) => {
          const status = lobby.status === 'waiting' ? '⏳' : lobby.status === 'started' ? '🎮' : '✅';
          message += `${status} Lobby #${lobby.id} - ${lobby.status}\n`;
        });
      }
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error in my_lobbies:', error);
    await ctx.reply('❌ Error loading lobbies. Try again later.');
  }
}
