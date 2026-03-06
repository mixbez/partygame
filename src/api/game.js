import { getDb } from '../db/index.js';
import { redis } from '../redis/index.js';
import crypto from 'crypto';

export async function setupGameRoutes(app) {
  const db = getDb();

  // Get game data for offline mode
  app.get('/api/partygame/game/:lobbyId/:playerId/:token', async (request, reply) => {
    const { lobbyId, playerId, token } = request.params;

    try {
      // Verify token (simple implementation - in production use JWT)
      const cachedToken = await redis.get(`game:${lobbyId}:${playerId}:token`);
      if (cachedToken !== token) {
        reply.code(401);
        return { error: 'Invalid token' };
      }

      // Get lobby
      const lobbyResult = await db.query(
        'SELECT * FROM lobbies WHERE id = $1 AND status = $2',
        [lobbyId, 'started']
      );

      if (lobbyResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Game not found or not started' };
      }

      const lobby = lobbyResult.rows[0];

      // Get participant info
      const participantResult = await db.query(
        `SELECT lp.*, u.username, u.first_name
         FROM lobby_participants lp
         LEFT JOIN users u ON lp.user_id = u.id
         WHERE lp.lobby_id = $1 AND lp.user_id = $2`,
        [lobbyId, playerId]
      );

      if (participantResult.rows.length === 0) {
        reply.code(403);
        return { error: 'Not a participant in this game' };
      }

      const participant = participantResult.rows[0];

      // Get facts assigned to this player (as answers they need to match)
      const factsResult = await db.query(
        `SELECT f.id, f.content, ga.answer_hash
         FROM game_assignments ga
         JOIN facts f ON ga.fact_id = f.id
         WHERE ga.lobby_id = $1 AND ga.assigned_to_user_id = $2`,
        [lobbyId, playerId]
      );

      // Get all participants
      const allParticipantsResult = await db.query(
        `SELECT lp.user_id, lp.nickname, u.username, u.first_name
         FROM lobby_participants lp
         LEFT JOIN users u ON lp.user_id = u.id
         WHERE lp.lobby_id = $1`,
        [lobbyId]
      );

      return {
        game: {
          lobbyId,
          status: lobby.status,
          mode: lobby.mode,
          gameSecret: lobby.game_secret,
          facts: factsResult.rows.map(f => ({
            id: f.id,
            content: f.content,
            answerHash: f.answer_hash,
          })),
          participants: allParticipantsResult.rows.map(p => ({
            userId: p.user_id,
            nickname: p.nickname,
            username: p.username,
          })),
          factsToWin: lobby.facts_to_win,
        },
      };
    } catch (error) {
      console.error('❌ Error fetching game data:', error);
      reply.code(500);
      return { error: 'Failed to fetch game data' };
    }
  });

  // Validate guess (offline mode)
  app.post('/api/partygame/game/:lobbyId/:playerId/:token/validate', async (request, reply) => {
    const { lobbyId, playerId, token } = request.params;
    const { factId, guessedNickname } = request.body;

    if (!factId || !guessedNickname) {
      reply.code(400);
      return { error: 'Missing required fields' };
    }

    try {
      // Verify token
      const cachedToken = await redis.get(`game:${lobbyId}:${playerId}:token`);
      if (cachedToken !== token) {
        reply.code(401);
        return { error: 'Invalid token' };
      }

      // Get the correct nickname for the fact author
      const assignmentResult = await db.query(
        `SELECT lp.nickname AS correct_nickname
         FROM game_assignments ga
         JOIN lobby_participants lp ON lp.lobby_id = ga.lobby_id AND lp.user_id = ga.from_user_id
         WHERE ga.lobby_id = $1 AND ga.fact_id = $2 AND ga.assigned_to_user_id = $3`,
        [lobbyId, factId, playerId]
      );

      if (assignmentResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Fact assignment not found' };
      }

      const { correct_nickname } = assignmentResult.rows[0];
      const isCorrect = correct_nickname === guessedNickname;

      if (isCorrect) {
        // Update player points
        await db.query(
          `UPDATE lobby_participants
           SET points = points + 1
           WHERE lobby_id = $1 AND user_id = $2`,
          [lobbyId, playerId]
        );

        // Check if player won
        const playerResult = await db.query(
          `SELECT points FROM lobby_participants
           WHERE lobby_id = $1 AND user_id = $2`,
          [lobbyId, playerId]
        );

        const currentPoints = playerResult.rows[0].points;
        const lobbyResult = await db.query(
          'SELECT facts_to_win FROM lobbies WHERE id = $1',
          [lobbyId]
        );

        const factsToWin = lobbyResult.rows[0].facts_to_win;
        const hasWon = currentPoints >= factsToWin;

        if (hasWon) {
          await db.query(
            'UPDATE lobbies SET status = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['finished', lobbyId]
          );
        }

        return {
          isCorrect: true,
          points: currentPoints,
          hasWon,
        };
      }

      return { isCorrect: false };
    } catch (error) {
      console.error('❌ Error validating guess:', error);
      reply.code(500);
      return { error: 'Failed to validate guess' };
    }
  });

  // Submit guess (online mode)
  app.post('/api/partygame/lobbies/:lobbyId/guess', async (request, reply) => {
    const { lobbyId } = request.params;
    const { playerId, factId, guessedNickname } = request.body;

    if (!playerId || !factId || !guessedNickname) {
      reply.code(400);
      return { error: 'Missing required fields' };
    }

    try {
      // Check if guess is correct — look up the fact AUTHOR's nickname (BUG-1 fix)
      const assignmentResult = await db.query(
        `SELECT lp.nickname AS correct_nickname
         FROM game_assignments ga
         JOIN lobby_participants lp ON lp.lobby_id = ga.lobby_id AND lp.user_id = ga.from_user_id
         WHERE ga.lobby_id = $1 AND ga.fact_id = $2`,
        [lobbyId, factId]
      );

      if (assignmentResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Fact not found in game' };
      }

      const correctNickname = assignmentResult.rows[0].correct_nickname;
      const isCorrect = guessedNickname === correctNickname;

      // Record guess
      await db.query(
        `INSERT INTO guesses (lobby_id, guesser_id, fact_id, guessed_nickname, is_correct)
         VALUES ($1, $2, $3, $4, $5)`,
        [lobbyId, playerId, factId, guessedNickname, isCorrect]
      );

      if (isCorrect) {
        // Update player points
        await db.query(
          `UPDATE lobby_participants
           SET points = points + 1
           WHERE lobby_id = $1 AND user_id = $2`,
          [lobbyId, playerId]
        );

        // Check if player won
        const playerResult = await db.query(
          `SELECT points FROM lobby_participants
           WHERE lobby_id = $1 AND user_id = $2`,
          [lobbyId, playerId]
        );

        const currentPoints = playerResult.rows[0].points;
        const lobbyResult = await db.query(
          'SELECT facts_to_win FROM lobbies WHERE id = $1',
          [lobbyId]
        );

        const factsToWin = lobbyResult.rows[0].facts_to_win;
        const hasWon = currentPoints >= factsToWin;

        if (hasWon) {
          await db.query(
            'UPDATE lobbies SET status = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['finished', lobbyId]
          );
        }

        return {
          isCorrect: true,
          points: currentPoints,
          correctNickname,
          hasWon,
        };
      }

      return { isCorrect: false };
    } catch (error) {
      console.error('❌ Error submitting guess:', error);
      reply.code(500);
      return { error: 'Failed to submit guess' };
    }
  });
}
