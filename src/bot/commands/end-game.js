import { getDb } from '../../db/index.js';

export async function endGameCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /end_game <lobby_id>\n\nExample: /end_game 3');
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
      await ctx.reply('❌ Only the host can end the game.');
      return;
    }

    if (lobby.status === 'waiting') {
      await ctx.reply('❌ Game hasn\'t started yet.');
      return;
    }

    if (lobby.status === 'finished') {
      await ctx.reply('❌ Game is already finished.');
      return;
    }

    // End the game
    await db.query(
      'UPDATE lobbies SET status = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['finished', lobbyId]
    );

    // Get final scores
    const scoresResult = await db.query(
      `SELECT u.first_name, lp.points
       FROM lobby_participants lp
       LEFT JOIN users u ON lp.user_id = u.id
       WHERE lp.lobby_id = $1
       ORDER BY lp.points DESC`,
      [lobbyId]
    );

    let message = `✅ Game #${lobbyId} ended!\n\nFinal Scores:\n`;
    scoresResult.rows.forEach((p, i) => {
      message += `${i + 1}. ${p.first_name} - ${p.points} points\n`;
    });

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error ending game:', error);
    await ctx.reply('❌ Error ending the game. Try again later.');
  }
}
