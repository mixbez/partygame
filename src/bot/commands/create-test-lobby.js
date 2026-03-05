import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function createTestLobbyCommand(ctx) {
  const userId = ctx.from.id;
  const adminId = parseInt(process.env.ADMIN_USER_ID || '0');

  console.log(`🔍 create_test_lobby: userId=${userId} (${typeof userId}), adminId=${adminId} (${typeof adminId}), match=${userId === adminId}`);

  // Only admin can create test lobbies
  if (userId !== adminId) {
    await ctx.reply(`❌ Only admin can create test lobbies. (Your ID: ${userId})`);
    return;
  }

  const db = getDb();

  try {
    // Create test lobby with lax settings
    const result = await db.query(
      `INSERT INTO lobbies (host_id, facts_per_player, facts_to_win, mode, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, 1, 1, 'test', 'waiting']
    );

    const lobbyId = result.rows[0].id;

    // Add host as participant
    await db.query(
      `INSERT INTO lobby_participants (lobby_id, user_id, ready) VALUES ($1, $2, $3)`,
      [lobbyId, userId, true]
    );

    // Store lobby session
    await redis.set(`lobby:${lobbyId}`, {
      id: lobbyId,
      host_id: userId,
      status: 'waiting',
      participants: [userId],
      mode: 'test',
    }, 3600);

    const message = `
✅ Test Lobby Created!

🎮 Lobby ID: ${lobbyId}
🧪 Mode: TEST (no restrictions)

Settings:
- Facts per player: 1
- Facts to win: 1
- No password required
- No fact requirement

This is for testing only!
    `.trim();

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error creating test lobby:', error);
    await ctx.reply('❌ Error creating test lobby. Try again later.');
  }
}
