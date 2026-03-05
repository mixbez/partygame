import { getDb } from '../../db/index.js';

export async function lobbyStatusCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /lobby_status <lobby_id>\n\nExample: /lobby_status 3');
    return;
  }

  const db = getDb();

  try {
    const lobbyResult = await db.query(
      'SELECT * FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found.');
      return;
    }

    const lobby = lobbyResult.rows[0];

    // Get participants
    const participantsResult = await db.query(
      `SELECT u.first_name, lp.points, lp.nickname
       FROM lobby_participants lp
       LEFT JOIN users u ON lp.user_id = u.id
       WHERE lp.lobby_id = $1
       ORDER BY lp.points DESC`,
      [lobbyId]
    );

    const participants = participantsResult.rows;

    let message = `Lobby #${lobbyId} Status\n`;
    message += `Status: ${lobby.status}\n`;
    message += `Mode: ${lobby.mode}\n`;
    message += `Facts per player: ${lobby.facts_per_player}\n`;
    message += `Facts to win: ${lobby.facts_to_win}\n`;
    message += `\nPlayers (${participants.length}):\n`;

    participants.forEach((p, i) => {
      const nickname = p.nickname || '(not assigned)';
      message += `${i + 1}. ${p.first_name} - ${nickname} (${p.points} points)\n`;
    });

    if (lobby.status === 'waiting') {
      message += `\nHost can start with: /start_game ${lobbyId}`;
    } else if (lobby.status === 'started') {
      message += `\nGame is in progress!`;
    } else if (lobby.status === 'finished') {
      message += `\nGame finished!`;
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error getting lobby status:', error);
    await ctx.reply('❌ Error loading lobby status. Try again later.');
  }
}
