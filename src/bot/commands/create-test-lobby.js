import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function createTestLobbyCommand(ctx) {
  const userId = ctx.from.id;
  const adminId = parseInt(process.env.ADMIN_USER_ID || '0');

  console.log(`🔍 create_test_lobby: userId=${userId} (${typeof userId}), adminId=${adminId} (${typeof adminId}), match=${userId === adminId}`);

  if (userId !== adminId) {
    await ctx.reply(`❌ Only admin can create test lobbies. (Your ID: ${userId})`);
    return;
  }

  const db = getDb();

  try {
    const result = await db.query(
      `INSERT INTO lobbies (host_id, facts_per_player, facts_to_win, mode, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, 1, 1, 'test', 'waiting']
    );

    const lobbyId = result.rows[0].id;

    await db.query(
      `INSERT INTO lobby_participants (lobby_id, user_id, ready) VALUES ($1, $2, $3)`,
      [lobbyId, userId, true]
    );

    await redis.set(`lobby:${lobbyId}`, {
      id: lobbyId, host_id: userId, status: 'waiting', participants: [userId], mode: 'test',
    }, 3600);

    await ctx.reply(
      `✅ Test lobby #${lobbyId} created!\n\n` +
      `Mode: TEST — no player/fact restrictions\n` +
      `Facts per player: 1, Facts to win: 1\n\n` +
      `Actions:\n` +
      `/lobby_status ${lobbyId} — view players\n` +
      `/start_game ${lobbyId} — start immediately\n` +
      `/edit_lobby ${lobbyId} facts_per_player 2\n` +
      `/cancel_lobby ${lobbyId} — cancel`
    );
  } catch (error) {
    console.error('❌ Error creating test lobby:', error);
    await ctx.reply('❌ Error creating test lobby. Try again later.');
  }
}
