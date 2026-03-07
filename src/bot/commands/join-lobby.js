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

    // Copy player's facts to lobby_facts (last 10 facts)
    const playerFactsResult = await db.query(
      `SELECT id, content FROM facts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    for (const fact of playerFactsResult.rows) {
      await db.query(
        `INSERT INTO lobby_facts (lobby_id, user_id, content, source_fact_id)
         VALUES ($1, $2, $3, $4)`,
        [lobbyId, userId, fact.content, fact.id]
      );
    }

    const factCount = playerFactsResult.rows.length;
    let replyMsg = `✅ You joined lobby #${lobbyId}!\n\n`;
    if (factCount > 0) {
      replyMsg += `✅ Copied ${factCount} of your facts to this lobby.\n\n`;
    } else {
      replyMsg += `⚠️ You have no facts yet. The host can add facts for you.\n\n`;
    }
    replyMsg += `Waiting for the host to start the game.\n\n`;
    replyMsg += `Check status: /lobby_status ${lobbyId}`;

    await ctx.reply(replyMsg);
  } catch (error) {
    console.error('❌ Error joining lobby:', error);
    await ctx.reply('❌ Error joining lobby. Try again later.');
  }
}
