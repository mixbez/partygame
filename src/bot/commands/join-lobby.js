import { getDb } from '../../db/index.js';

export async function joinLobbyCommand(ctx) {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];
  const providedPassword = args[2];

  if (!lobbyId) {
    await ctx.reply(
      'Usage: /join_lobby <lobby_id> [password]\n\n' +
      'Example: /join_lobby 123\n' +
      'Example with password: /join_lobby 123 secret'
    );
    return;
  }

  const db = getDb();

  try {
    const lobbyResult = await db.query(
      'SELECT id, status, password FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found. Check the ID and try again.');
      return;
    }

    const lobby = lobbyResult.rows[0];

    if (lobby.status !== 'waiting') {
      await ctx.reply(`❌ This lobby is already ${lobby.status} and not accepting new players.`);
      return;
    }

    if (lobby.password) {
      if (!providedPassword) {
        await ctx.reply(
          `❌ This lobby requires a password.\n\n` +
          `Use: /join_lobby ${lobbyId} <password>`
        );
        return;
      }
      if (providedPassword !== lobby.password) {
        await ctx.reply('❌ Wrong password!');
        return;
      }
    }

    const factsResult = await db.query(
      'SELECT COUNT(*) as count FROM facts WHERE user_id = $1',
      [userId]
    );

    if (parseInt(factsResult.rows[0].count) === 0) {
      await ctx.reply(
        '❌ You need at least 1 fact to join a lobby.\n\n' +
        'Add a fact first: just send me any text message, then try again.'
      );
      return;
    }

    const existingResult = await db.query(
      'SELECT id FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2',
      [lobbyId, userId]
    );

    if (existingResult.rows.length > 0) {
      await ctx.reply(
        `✅ You're already in lobby #${lobbyId}.\n\n` +
        `Check status: /lobby_status ${lobbyId}`
      );
      return;
    }

    await db.query(
      `INSERT INTO lobby_participants (lobby_id, user_id, ready) VALUES ($1, $2, $3)`,
      [lobbyId, userId, false]
    );

    await ctx.reply(
      `✅ You joined lobby #${lobbyId}!\n\n` +
      `Waiting for the host to start the game.\n\n` +
      `Check status: /lobby_status ${lobbyId}`
    );
  } catch (error) {
    console.error('❌ Error joining lobby:', error);
    await ctx.reply('❌ Error joining lobby. Try again later.');
  }
}
