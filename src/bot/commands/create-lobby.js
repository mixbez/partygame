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

    // Copy host's facts to lobby_facts
    const hostFactsResult = await db.query(
      `SELECT id, content FROM facts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    for (const fact of hostFactsResult.rows) {
      await db.query(
        `INSERT INTO lobby_facts (lobby_id, user_id, content, source_fact_id)
         VALUES ($1, $2, $3, $4)`,
        [lobbyId, userId, fact.content, fact.id]
      );
    }

    await redis.set(`lobby:${lobbyId}`, {
      id: lobbyId, host_id: userId, status: 'waiting', participants: [userId],
    }, 3600);

    const message = `
✅ Lobby #${lobbyId} created! (You're in)

Settings:
- Facts per player: 10
- Facts to win: 7
- Mode: online
- Password: none

What to do next:
1️⃣ /lobby_status ${lobbyId} — view current players
2️⃣ Share with friends: /join_lobby ${lobbyId}

Change settings (while waiting):
/edit_lobby ${lobbyId} facts_per_player 5
/edit_lobby ${lobbyId} facts_to_win 3
/edit_lobby ${lobbyId} mode offline
/edit_lobby ${lobbyId} password secret123

When everyone joined & added facts:
🎮 Use host dashboard to generate game
📊 /my_lobbies → click Dashboard link

Then:
/start_game ${lobbyId} — send game links to players

Cancel:
/cancel_lobby ${lobbyId}
    `.trim();

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error creating lobby:', error);
    await ctx.reply('❌ Error creating lobby. Try again later.');
  }
}
