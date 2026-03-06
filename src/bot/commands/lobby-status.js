import { getDb } from '../../db/index.js';

export async function lobbyStatusCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /lobby_status <lobby_id>\nExample: /lobby_status 3');
    return;
  }

  const db = getDb();

  try {
    const lobbyResult = await db.query(
      'SELECT host_id, status, mode, facts_per_player, facts_to_win, password FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found.');
      return;
    }

    const lobby = lobbyResult.rows[0];
    const isHost = Number(lobby.host_id) === ctx.from.id;

    const participantsResult = await db.query(
      `SELECT u.first_name, u.username, lp.points, lp.nickname
       FROM lobby_participants lp
       LEFT JOIN users u ON lp.user_id = u.id
       WHERE lp.lobby_id = $1
       ORDER BY lp.points DESC`,
      [lobbyId]
    );

    const participants = participantsResult.rows;
    const passwordInfo = lobby.password
      ? (isHost ? lobby.password : 'yes (ask the host)')
      : 'none';

    let message = `Lobby #${lobbyId}\n`;
    message += `Status: ${lobby.status}\n`;
    message += `Mode: ${lobby.mode}\n`;
    message += `Facts per player: ${lobby.facts_per_player}\n`;
    message += `Facts to win: ${lobby.facts_to_win}\n`;
    message += `Password: ${passwordInfo}\n`;
    message += `\nPlayers (${participants.length}):\n`;

    participants.forEach((p, i) => {
      const name = p.first_name || p.username || 'Unknown';
      const nickname = p.nickname ? ` [${p.nickname}]` : '';
      message += `${i + 1}. ${name}${nickname}`;
      if (lobby.status === 'started') message += ` — ${p.points} pts`;
      message += '\n';
    });

    if (isHost) {
      if (lobby.status === 'waiting') {
        message += `\nHost actions:\n`;
        message += `/start_game ${lobbyId} — start the game\n`;
        message += `/edit_lobby ${lobbyId} facts_per_player 5\n`;
        message += `/edit_lobby ${lobbyId} facts_to_win 3\n`;
        message += `/edit_lobby ${lobbyId} mode offline\n`;
        message += `/edit_lobby ${lobbyId} password secret123\n`;
        message += `/cancel_lobby ${lobbyId} — cancel lobby`;
      } else if (lobby.status === 'started') {
        message += `\nHost actions:\n`;
        message += `/end_game ${lobbyId} — force end the game`;
      }
    } else if (lobby.status === 'waiting') {
      message += `\nWaiting for host to start the game.`;
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error getting lobby status:', error);
    await ctx.reply('❌ Error loading lobby status. Try again later.');
  }
}
