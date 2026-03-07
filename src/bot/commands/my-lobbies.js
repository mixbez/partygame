import { getDb } from '../../db/index.js';
import crypto from 'crypto';

function generateHostToken(userId, lobbyId) {
  return crypto
    .createHash('sha256')
    .update(`${userId}:${lobbyId}:${process.env.JWT_SECRET || 'secret'}`)
    .digest('hex');
}

export async function myLobbiesCommand(ctx) {
  const userId = ctx.from.id;
  const db = getDb();
  console.log(`🎮 /my_lobbies from user ${userId}`);

  try {
    const hostedResult = await db.query(
      `SELECT id, status, facts_per_player, facts_to_win FROM lobbies
       WHERE host_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    const joinedResult = await db.query(
      `SELECT l.id, l.status, l.host_id FROM lobbies l
       INNER JOIN lobby_participants lp ON l.id = lp.lobby_id
       WHERE lp.user_id = $1 AND l.host_id != $2
       ORDER BY l.created_at DESC LIMIT 10`,
      [userId, userId]
    );

    if (hostedResult.rows.length === 0 && joinedResult.rows.length === 0) {
      await ctx.reply(
        'You have no active lobbies.\n\n' +
        '/create_lobby — create a new game\n' +
        '/join_lobby <id> — join existing game'
      );
      return;
    }

    let message = 'Your lobbies:\n\n';

    if (hostedResult.rows.length > 0) {
      message += 'Hosted by you:\n';
      hostedResult.rows.forEach((lobby) => {
        const icon = lobby.status === 'waiting' ? '⏳' : lobby.status === 'started' ? '🎮' : '✅';
        message += `${icon} #${lobby.id} — ${lobby.status}\n`;

        const baseUrl = process.env.BOT_WEBHOOK_URL || 'https://v2202504269079335176.supersrv.de';

        if (lobby.status === 'waiting') {
          const token = generateHostToken(userId, lobby.id);
          const dashboardUrl = `${baseUrl}/game/host/${lobby.id}?token=${token}`;
          message += `   📊 <a href="${dashboardUrl}">Dashboard</a> | /start_game ${lobby.id} | /cancel_lobby ${lobby.id}\n`;
        } else if (lobby.status === 'generated') {
          const token = generateHostToken(userId, lobby.id);
          const dashboardUrl = `${baseUrl}/game/host/${lobby.id}?token=${token}`;
          const printUrl = `${baseUrl}/game/print/${lobby.id}?token=${token}`;
          message += `   📊 <a href="${dashboardUrl}">Dashboard</a> | 🖨️ <a href="${printUrl}">Print</a> | /start_game ${lobby.id}\n`;
        } else if (lobby.status === 'started') {
          message += `   /lobby_status ${lobby.id} | /end_game ${lobby.id}\n`;
        } else {
          message += `   /lobby_status ${lobby.id}\n`;
        }
      });
      message += '\n';
    }

    if (joinedResult.rows.length > 0) {
      message += 'Joined:\n';
      joinedResult.rows.forEach((lobby) => {
        const icon = lobby.status === 'waiting' ? '⏳' : lobby.status === 'started' ? '🎮' : '✅';
        message += `${icon} #${lobby.id} — ${lobby.status}\n`;
        message += `   /lobby_status ${lobby.id}\n`;
      });
    }

    console.log(`✅ Sending message with ${hostedResult.rows.length} hosted lobbies`);
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('❌ Error in my_lobbies:', error);
    console.error('Stack:', error.stack);
    await ctx.reply('❌ Error loading lobbies. Try again later.');
  }
}
