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

      // Get participants with fact counts
      const participantsResult = await db.query(
        `SELECT lp.*, u.username, u.first_name,
                COUNT(f.id) as fact_count
         FROM lobby_participants lp
         LEFT JOIN users u ON lp.user_id = u.id
         LEFT JOIN facts f ON f.user_id = lp.user_id AND f.id NOT IN (
           SELECT fact_id FROM excluded_facts WHERE lobby_id = $1
         )
         WHERE lp.lobby_id = $1
         GROUP BY lp.id, u.id
         ORDER BY lp.id ASC`,
        [id]
      );

      // Get all facts (including excluded ones)
      const allFactsResult = await db.query(
        `SELECT f.id, f.user_id, f.content, f.created_at,
                CASE WHEN ef.id IS NOT NULL THEN true ELSE false END as excluded
         FROM facts f
         LEFT JOIN excluded_facts ef ON f.id = ef.fact_id AND ef.lobby_id = $1
         WHERE f.user_id = ANY(
           SELECT user_id FROM lobby_participants WHERE lobby_id = $1
         )
         ORDER BY f.user_id, f.created_at DESC`,
        [id]
      );

      // Get excluded facts
      const excludedFactsResult = await db.query(
        'SELECT fact_id FROM excluded_facts WHERE lobby_id = $1',
        [id]
      );
      const excludedFactIds = new Set(excludedFactsResult.rows.map(r => r.fact_id));

      // Validate game readiness
      const participants = participantsResult.rows;
      const totalAvailableFacts = allFactsResult.rows.filter(f => !f.excluded).length;
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
        lobby: { ...lobby, participants },
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

  // 2. Toggle fact exclusion (exclude/include)
  app.post('/api/partygame/host/lobbies/:id/facts/:factId/toggle', async (request, reply) => {
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

      if (lobby.status !== 'waiting' && lobby.status !== 'generated') {
        reply.code(400);
        return { error: 'Cannot modify facts in this lobby state' };
      }

      // Check if fact is excluded
      const excludedResult = await db.query(
        'SELECT id FROM excluded_facts WHERE lobby_id = $1 AND fact_id = $2',
        [id, factId]
      );

      if (excludedResult.rows.length > 0) {
        // Remove from excluded
        await db.query(
          'DELETE FROM excluded_facts WHERE lobby_id = $1 AND fact_id = $2',
          [id, factId]
        );
        return { ok: true, excluded: false };
      } else {
        // Add to excluded
        await db.query(
          'INSERT INTO excluded_facts (lobby_id, fact_id) VALUES ($1, $2)',
          [id, factId]
        );
        return { ok: true, excluded: true };
      }
    } catch (error) {
      console.error('❌ Error toggling fact:', error);
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        return;
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  // 3. Add manual fact by host
  app.post('/api/partygame/host/lobbies/:id/facts/add', async (request, reply) => {
    const { id } = request.params;
    const { content } = request.body || {};

    try {
      if (!content || content.trim().length === 0) {
        reply.code(400);
        return { error: 'Fact content is required' };
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

      if (lobby.status !== 'waiting' && lobby.status !== 'generated') {
        reply.code(400);
        return { error: 'Cannot add facts in this lobby state' };
      }

      // Insert fact attributed to host
      const result = await db.query(
        'INSERT INTO facts (user_id, content) VALUES ($1, $2) RETURNING id, content, created_at',
        [lobby.host_id, content.trim()]
      );

      const newFact = result.rows[0];
      return { ok: true, fact: newFact };
    } catch (error) {
      console.error('❌ Error adding fact:', error);
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

      // Get facts (excluding marked ones)
      const factsResult = await db.query(
        `SELECT f.id AS "factId", f.user_id AS "userId"
         FROM facts f
         WHERE f.user_id = ANY($1::BIGINT[])
         AND f.id NOT IN (
           SELECT fact_id FROM excluded_facts WHERE lobby_id = $2
         )
         ORDER BY f.id`,
        [participants, id]
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
}
