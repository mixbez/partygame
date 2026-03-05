import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function createLobbyCommand(ctx) {
  const userId = ctx.from.id;
  const db = getDb();

  try {
    // Create lobby with defaults
    const result = await db.query(
      `INSERT INTO lobbies (host_id, facts_per_player, facts_to_win, mode, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, 2, 3, 'online', 'waiting']
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
    }, 3600); // 1 hour TTL

    const message = `
✅ Lobby Created!

🎮 Lobby ID: ${lobbyId}

Settings:
- Facts per player: 2
- Facts to win: 3
- Mode: Online
- Status: Waiting for players

Share this ID with friends to let them join!

/join_lobby ${lobbyId} - Friends can use this command

Once everyone joins, you can start the game
    `.trim();

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error creating lobby:', error);
    await ctx.reply('❌ Error creating lobby. Try again later.');
  }
}
