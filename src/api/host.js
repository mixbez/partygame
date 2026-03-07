import { getDb } from '../db/index.js';
import { generateNicknames, distributeFacts, validateDistribution } from '../game/generator.js';
import { redis } from '../redis/index.js';
import crypto from 'crypto';

// Host token verification middleware
function verifyHostToken(request, reply, lobbyId, hostId) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    reply.code(401);
    throw new Error('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const expectedToken = crypto
    .createHash('sha256')
    .update(`${hostId}:${lobbyId}:${process.env.JWT_SECRET || 'secret'}`)
    .digest('hex');

  if (token !== expectedToken) {
    reply.code(403);
    throw new Error('Invalid host token');
  }
}

export async function setupHostRoutes(app) {
  const db = getDb();

  // Generate host token for dashboard access (authentication)
  app.post('/api/partygame/host/lobbies/:id/token', async (request, reply) => {
    const { id } = request.params;
    const userId = request.body?.user_id; // From Telegram bot context

    try {
      // In production, verify user_id comes from authenticated context
      if (!userId) {
        reply.code(400);
        return { error: 'user_id is required' };
      }

      const lobbyResult = await db.query(
        'SELECT host_id FROM lobbies WHERE id = $1',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const lobby = lobbyResult.rows[0];

      if (Number(lobby.host_id) !== Number(userId)) {
        reply.code(403);
        return { error: 'Only the host can access the dashboard' };
      }

      // Generate host token
      const token = crypto
        .createHash('sha256')
        .update(`${userId}:${id}:${process.env.JWT_SECRET || 'secret'}`)
        .digest('hex');

      return {
        ok: true,
        token,
        dashboardUrl: `${process.env.BOT_WEBHOOK_URL}/game/host/${id}?token=${token}`,
        printUrl: `${process.env.BOT_WEBHOOK_URL}/game/print/${id}?token=${token}`
      };
    } catch (error) {
      console.error('❌ Error generating host token:', error);
      reply.code(500);
      return { error: error.message };
    }
  });

  // 1. Get dashboard view: lobby, participants, facts, validation status
  app.get('/api/partygame/host/lobbies/:id', async (request, reply) => {
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

      const lobby = lobbyResult.rows[0];
      const hostId = lobby.host_id;

      // Verify host token
      verifyHostToken(request, reply, id, hostId);

      // Get participants
      const participantsResult = await db.query(
        `SELECT lp.*, u.username, u.first_name
         FROM lobby_participants lp
         LEFT JOIN users u ON lp.user_id = u.id
         WHERE lp.lobby_id = $1
         ORDER BY lp.id ASC`,
        [id]
      );

      const participants = participantsResult.rows;

      // Get facts for each participant from lobby_facts
      const participantsWithFacts = [];
      for (const participant of participants) {
        const factsResult = await db.query(
          `SELECT id, content, added_by_host, created_at FROM lobby_facts
           WHERE lobby_id = $1 AND user_id = $2
           ORDER BY created_at ASC`,
          [id, participant.user_id]
        );
        participantsWithFacts.push({
          ...participant,
          facts: factsResult.rows
        });
      }

      // Get all facts from this lobby
      const allFactsResult = await db.query(
        `SELECT id, user_id, content, added_by_host, created_at FROM lobby_facts
         WHERE lobby_id = $1
         ORDER BY user_id, created_at ASC`,
        [id]
      );

      // Validate game readiness
      const totalAvailableFacts = allFactsResult.rows.length;
      const factsNeeded = participants.length * lobby.facts_per_player;
      const canGenerate = participants.length >= 2 && totalAvailableFacts >= factsNeeded;

      const validation = {
        minPlayersReached: participants.length >= 2,
        playerCount: participants.length,
        minimumFacts: factsNeeded,
        availableFacts: totalAvailableFacts,
        canGenerate,
        message: canGenerate ? 'Ready to generate!' :
          participants.length < 2 ? 'Need at least 2 players' :
          'Not enough facts available'
      };

      return {
        lobby,
        participants: participantsWithFacts,
        facts: allFactsResult.rows,
        validation
      };
    } catch (error) {
      console.error('❌ Error fetching dashboard:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 4. Generate game: nicknames + fact distribution (moves to 'generated' state)
  app.post('/api/partygame/host/lobbies/:id/generate', async (request, reply) => {
    const { id } = request.params;

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
      verifyHostToken(request, reply, id, lobby.host_id);

      // Check if host is a participant
      const hostParticipantResult = await db.query(
        'SELECT id FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2',
        [id, lobby.host_id]
      );

      if (hostParticipantResult.rows.length === 0) {
        reply.code(400);
        return { error: 'Host must join the lobby to generate the game' };
      }

      if (lobby.status !== 'waiting') {
        reply.code(400);
        return { error: 'Lobby must be in "waiting" state to generate game' };
      }

      // Get participants
      const participantsResult = await db.query(
        'SELECT user_id FROM lobby_participants WHERE lobby_id = $1',
        [id]
      );

      const participants = participantsResult.rows.map(r => r.user_id);

      if (participants.length < 2) {
        reply.code(400);
        return { error: 'Need at least 2 players to generate game' };
      }

      // Get facts from lobby_facts
      const factsResult = await db.query(
        `SELECT lf.id AS "factId", lf.user_id AS "userId"
         FROM lobby_facts lf
         WHERE lf.lobby_id = $1
         ORDER BY lf.id`,
        [id]
      );

      const facts = factsResult.rows;

      if (facts.length < participants.length * lobby.facts_per_player) {
        reply.code(400);
        return {
          error: 'Not enough facts for fair game distribution',
          available: facts.length,
          needed: participants.length * lobby.facts_per_player
        };
      }

      // Generate nicknames
      const nicknames = generateNicknames(participants.length);

      // Assign nicknames
      for (let i = 0; i < participants.length; i++) {
        await db.query(
          'UPDATE lobby_participants SET nickname = $1 WHERE lobby_id = $2 AND user_id = $3',
          [nicknames[i], id, participants[i]]
        );
      }

      // Distribute facts
      const assignments = distributeFacts(facts, participants, lobby.facts_per_player);

      if (!validateDistribution(assignments, participants, lobby.facts_per_player)) {
        reply.code(500);
        return { error: 'Fact distribution validation failed' };
      }

      // Generate game secret
      const gameSecret = crypto.randomBytes(32).toString('hex');

      // Generate tokens and URLs for each participant
      for (const userId of participants) {
        const gameToken = crypto.randomBytes(16).toString('hex');
        const gameUrl = `${process.env.BOT_WEBHOOK_URL}/game?lobby=${id}&player=${userId}&token=${gameToken}`;

        await db.query(
          'UPDATE lobby_participants SET game_token = $1, game_url = $2 WHERE lobby_id = $3 AND user_id = $4',
          [gameToken, gameUrl, id, userId]
        );

        await redis.set(`game:${id}:${userId}:token`, gameToken, 86400);
      }

      // Store game assignments
      for (const assignment of assignments) {
        const authorIdx = participants.map(String).indexOf(String(assignment.fromUserId));
        const correctNickname = nicknames[authorIdx];
        const answerHash = crypto
          .createHash('sha256')
          .update(`${assignment.factId}${correctNickname}${gameSecret}`)
          .digest('hex');

        await db.query(
          `INSERT INTO game_assignments (lobby_id, fact_id, assigned_to_user_id, from_user_id, answer_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, assignment.factId, assignment.assignedToUserId, assignment.fromUserId, answerHash]
        );
      }

      // Update lobby status to 'generated'
      await db.query(
        'UPDATE lobbies SET status = $1, game_secret = $2 WHERE id = $3',
        ['generated', gameSecret, id]
      );

      // Cache nickname mapping
      const nicknameMap = {};
      for (let i = 0; i < participants.length; i++) {
        nicknameMap[participants[i]] = nicknames[i];
      }
      await redis.set(`lobby:${id}:nicknames`, nicknameMap, 86400);

      return { ok: true, message: 'Game generated successfully', nicknames };
    } catch (error) {
      console.error('❌ Error generating game:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 5. Get print data
  app.get('/api/partygame/host/lobbies/:id/print', async (request, reply) => {
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

      const lobby = lobbyResult.rows[0];
      verifyHostToken(request, reply, id, lobby.host_id);

      if (lobby.status !== 'generated' && lobby.status !== 'started') {
        reply.code(400);
        return { error: 'Game must be generated before printing' };
      }

      // Get participants with nicknames
      const participantsResult = await db.query(
        `SELECT lp.user_id, lp.nickname, u.username, u.first_name
         FROM lobby_participants lp
         LEFT JOIN users u ON lp.user_id = u.id
         WHERE lp.lobby_id = $1
         ORDER BY lp.id ASC`,
        [id]
      );

      // Get facts for each participant
      const printData = [];
      for (const participant of participantsResult.rows) {
        const factsResult = await db.query(
          `SELECT f.id, f.content
           FROM game_assignments ga
           JOIN facts f ON ga.fact_id = f.id
           WHERE ga.lobby_id = $1 AND ga.assigned_to_user_id = $2
           ORDER BY ga.id ASC`,
          [id, participant.user_id]
        );

        printData.push({
          nickname: participant.nickname,
          displayName: participant.first_name || participant.username || `Player ${participant.user_id}`,
          facts: factsResult.rows,
          allNicknames: participantsResult.rows.map(p => p.nickname)
        });
      }

      return { lobby, printData };
    } catch (error) {
      console.error('❌ Error fetching print data:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 7. PUT /api/partygame/host/lobbies/:id/settings - Update lobby settings
  app.put('/api/partygame/host/lobbies/:id/settings', async (request, reply) => {
    const { id } = request.params;
    const { facts_per_player, facts_to_win, mode, password } = request.body || {};

    try {
      const lobbyResult = await db.query(
        'SELECT host_id, status FROM lobbies WHERE id = $1',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const lobby = lobbyResult.rows[0];
      verifyHostToken(request, reply, id, lobby.host_id);

      if (lobby.status !== 'waiting') {
        reply.code(400);
        return { error: 'Can only change settings while lobby is waiting' };
      }

      // Validation
      if (facts_per_player !== undefined && (typeof facts_per_player !== 'number' || facts_per_player < 1)) {
        reply.code(400);
        return { error: 'facts_per_player must be a number >= 1' };
      }

      if (facts_to_win !== undefined && (typeof facts_to_win !== 'number' || facts_to_win < 1)) {
        reply.code(400);
        return { error: 'facts_to_win must be a number >= 1' };
      }

      if (mode !== undefined && !['online', 'offline'].includes(mode)) {
        reply.code(400);
        return { error: 'mode must be "online" or "offline"' };
      }

      // Validate facts_to_win <= facts_per_player
      const fpp = facts_per_player !== undefined ? facts_per_player : lobby.facts_per_player;
      const ftw = facts_to_win !== undefined ? facts_to_win : lobby.facts_to_win;

      if (ftw > fpp) {
        reply.code(400);
        return { error: 'facts_to_win cannot exceed facts_per_player' };
      }

      // Update
      const updateResult = await db.query(
        `UPDATE lobbies SET
          facts_per_player = COALESCE($2, facts_per_player),
          facts_to_win = COALESCE($3, facts_to_win),
          mode = COALESCE($4, mode),
          password = $5
         WHERE id = $1
         RETURNING *`,
        [id, facts_per_player, facts_to_win, mode, password || null]
      );

      return { ok: true, lobby: updateResult.rows[0] };
    } catch (error) {
      console.error('❌ Error updating settings:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 8. DELETE /api/partygame/host/lobbies/:id/participants/:userId - Kick participant
  app.delete('/api/partygame/host/lobbies/:id/participants/:userId', async (request, reply) => {
    const { id, userId } = request.params;

    try {
      const lobbyResult = await db.query(
        'SELECT host_id, status FROM lobbies WHERE id = $1',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const lobby = lobbyResult.rows[0];
      verifyHostToken(request, reply, id, lobby.host_id);

      if (lobby.status !== 'waiting') {
        reply.code(400);
        return { error: 'Can only kick participants while lobby is waiting' };
      }

      if (Number(lobby.host_id) === Number(userId)) {
        reply.code(400);
        return { error: 'Cannot kick the host' };
      }

      // Delete player's facts from lobby
      await db.query(
        'DELETE FROM lobby_facts WHERE lobby_id = $1 AND user_id = $2',
        [id, userId]
      );

      // Remove participant
      await db.query(
        'DELETE FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2',
        [id, userId]
      );

      return { ok: true };
    } catch (error) {
      console.error('❌ Error kicking participant:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 9. POST /api/partygame/host/lobbies/:id/participants/:userId/facts - Add fact for participant
  app.post('/api/partygame/host/lobbies/:id/participants/:userId/facts', async (request, reply) => {
    const { id, userId } = request.params;
    const { content } = request.body || {};

    try {
      if (!content || typeof content !== 'string' || content.length < 5 || content.length > 500) {
        reply.code(400);
        return { error: 'Fact content must be 5-500 characters' };
      }

      const lobbyResult = await db.query(
        'SELECT host_id, status FROM lobbies WHERE id = $1',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const lobby = lobbyResult.rows[0];
      verifyHostToken(request, reply, id, lobby.host_id);

      if (lobby.status !== 'waiting') {
        reply.code(400);
        return { error: 'Can only add facts while lobby is waiting' };
      }

      // Verify participant is in lobby
      const participantResult = await db.query(
        'SELECT id FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2',
        [id, userId]
      );

      if (participantResult.rows.length === 0) {
        reply.code(400);
        return { error: 'Participant not in this lobby' };
      }

      // Add fact
      const result = await db.query(
        `INSERT INTO lobby_facts (lobby_id, user_id, content, added_by_host)
         VALUES ($1, $2, $3, true)
         RETURNING id, content, added_by_host, created_at`,
        [id, userId, content.trim()]
      );

      return { ok: true, fact: result.rows[0] };
    } catch (error) {
      console.error('❌ Error adding fact:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 10. DELETE /api/partygame/host/lobbies/:id/facts/:factId - Delete fact from lobby
  app.delete('/api/partygame/host/lobbies/:id/facts/:factId', async (request, reply) => {
    const { id, factId } = request.params;

    try {
      const lobbyResult = await db.query(
        'SELECT host_id, status FROM lobbies WHERE id = $1',
        [id]
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Lobby not found' };
      }

      const lobby = lobbyResult.rows[0];
      verifyHostToken(request, reply, id, lobby.host_id);

      if (lobby.status !== 'waiting') {
        reply.code(400);
        return { error: 'Can only delete facts while lobby is waiting' };
      }

      // Verify fact belongs to this lobby
      const factResult = await db.query(
        'SELECT id FROM lobby_facts WHERE id = $1 AND lobby_id = $2',
        [factId, id]
      );

      if (factResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Fact not found in this lobby' };
      }

      // Delete
      await db.query(
        'DELETE FROM lobby_facts WHERE id = $1 AND lobby_id = $2',
        [factId, id]
      );

      return { ok: true };
    } catch (error) {
      console.error('❌ Error deleting fact:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });
}
