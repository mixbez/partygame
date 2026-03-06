import { getDb } from '../db/index.js';
import { generateNicknames, distributeFacts, validateDistribution } from '../game/generator.js';
import { redis } from '../redis/index.js';
import crypto from 'crypto';

export async function setupLobbiesRoutes(app) {
  const db = getDb();

  // Get all active lobbies
  app.get('/api/partygame/lobbies', async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT l.id, l.host_id, l.status, l.facts_per_player, l.facts_to_win,
                COUNT(lp.id) as participant_count
         FROM lobbies l
         LEFT JOIN lobby_participants lp ON l.id = lp.lobby_id
         WHERE l.status = 'waiting' OR l.status = 'started'
         GROUP BY l.id
         ORDER BY l.created_at DESC
         LIMIT 50`
      );

      return { lobbies: result.rows };
    } catch (error) {
      console.error('❌ Error fetching lobbies:', error);
      reply.code(500);
      return { error: 'Failed to fetch lobbies' };
    }
  });

  // Get specific lobby details
  app.get('/api/partygame/lobbies/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const lobbyResult = await db.query(
        'SELECT * FROM lobbies WHERE id = $1',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const participantsResult = await db.query(
        `SELECT lp.*, u.username, u.first_name
         FROM lobby_participants lp
         LEFT JOIN users u ON lp.user_id = u.id
         WHERE lp.lobby_id = $1
         ORDER BY lp.id ASC`,
        [id]
      );

      const lobby = lobbyResult.rows[0];
      lobby.participants = participantsResult.rows;

      return { lobby };
    } catch (error) {
      console.error('❌ Error fetching lobby:', error);
      reply.code(500);
      return { error: 'Failed to fetch lobby' };
    }
  });

  // Start game (generate nicknames and distribute facts)
  app.post('/api/partygame/lobbies/:id/start', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    try {
      const lobbyResult = await db.query(
        'SELECT * FROM lobbies WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const lobby = lobbyResult.rows[0];

      if (lobby.status !== 'waiting') {
        reply.code(400);
        return { error: 'Lobby is not in waiting status' };
      }

      // Get participants
      const participantsResult = await db.query(
        'SELECT user_id FROM lobby_participants WHERE lobby_id = $1',
        [id]
      );

      const participants = participantsResult.rows.map(r => r.user_id);

      if (participants.length < 2) {
        reply.code(400);
        return { error: 'Need at least 2 players to start' };
      }

      // Generate nicknames
      const nicknames = generateNicknames(participants.length);

      // Generate game secret
      const gameSecret = crypto.randomBytes(32).toString('hex');

      // Assign nicknames to participants
      for (let i = 0; i < participants.length; i++) {
        await db.query(
          'UPDATE lobby_participants SET nickname = $1 WHERE lobby_id = $2 AND user_id = $3',
          [nicknames[i], id, participants[i]]
        );
      }

      // Get all facts from participants for distribution
      const factsResult = await db.query(
        `SELECT f.id AS "factId", f.user_id AS "userId" FROM facts f
         WHERE f.user_id = ANY($1::BIGINT[])
         LIMIT $2`,
        [participants, participants.length * lobby.facts_per_player * 2]
      );

      const facts = factsResult.rows;

      // Distribute facts
      if (facts.length < participants.length * lobby.facts_per_player) {
        reply.code(400);
        return { error: 'Not enough facts for fair game distribution' };
      }

      const assignments = distributeFacts(
        facts,
        participants,
        lobby.facts_per_player
      );

      // Validate distribution
      if (!validateDistribution(assignments, participants, lobby.facts_per_player)) {
        reply.code(500);
        return { error: 'Fact distribution validation failed' };
      }

      // Store assignments in database (BUG-4+5 fix: use fromUserId for hash and store from_user_id)
      for (const assignment of assignments) {
        const authorNickname = nicknames[participants.map(String).indexOf(String(assignment.fromUserId))];
        const answerHash = crypto
          .createHash('sha256')
          .update(`${assignment.factId}${authorNickname}${gameSecret}`)
          .digest('hex');

        await db.query(
          `INSERT INTO game_assignments (lobby_id, fact_id, assigned_to_user_id, from_user_id, answer_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, assignment.factId, assignment.assignedToUserId, assignment.fromUserId, answerHash]
        );
      }

      // Update lobby status
      await db.query(
        'UPDATE lobbies SET status = $1, game_secret = $2, started_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['started', gameSecret, id]
      );

      // Cache nickname mapping
      const nicknameMap = {};
      for (let i = 0; i < participants.length; i++) {
        nicknameMap[participants[i]] = nicknames[i];
      }
      await redis.set(`lobby:${id}:nicknames`, nicknameMap, 86400);

      return { ok: true, message: 'Game started!' };
    } catch (error) {
      console.error('❌ Error starting game:', error);
      reply.code(500);
      return { error: 'Failed to start game' };
    }
  });
}
