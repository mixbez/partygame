import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';

export async function createLobbyCommand(ctx) {
  const userId = ctx.from.id;
  const db = getDb();

  try {
    const result = await db.query(
      `INSERT INTO lobbies (host_id, facts_per_player, facts_to_win, mode, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, 10, 7, 'online', 'waiting']
    );

    const lobbyId = result.rows[0].id;

    await db.query(
      `INSERT INTO lobby_participants (lobby_id, user_id, ready) VALUES ($1, $2, $3)`,
      [lobbyId, userId, true]
    );

    await redis.set(`lobby:${lobbyId}`, {
      id: lobbyId, host_id: userId, status: 'waiting', participants: [userId],
    }, 3600);

    const message = `
✅ Lobby #${lobbyId} created!

Settings:
- Facts per player: 10
- Facts to win: 7
- Mode: online
- Password: none

What to do next:
/lobby_status ${lobbyId} — view current players
/join_lobby ${lobbyId} — share this with friends

Change settings (while waiting):
/edit_lobby ${lobbyId} facts_per_player 5
/edit_lobby ${lobbyId} facts_to_win 3
/edit_lobby ${lobbyId} mode offline
/edit_lobby ${lobbyId} password secret123

When everyone joined:
/start_game ${lobbyId}

Cancel:
/cancel_lobby ${lobbyId}
    `.trim();

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error creating lobby:', error);
    await ctx.reply('❌ Error creating lobby. Try again later.');
  }
}
