import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';
import { generateNicknames, distributeFacts } from '../../game/generator.js';
import crypto from 'crypto';

export async function handleStartGame(ctx, lobbyId) {
  const db = getDb();

  try {
    // Get lobby settings
    const lobbyResult = await db.query(
      'SELECT facts_per_player, facts_to_win, mode FROM lobbies WHERE id = $1',
      [lobbyId]
    );
    const lobby = lobbyResult.rows[0];

    // Get all participants
    const participantsResult = await db.query(
      'SELECT user_id FROM lobby_participants WHERE lobby_id = $1',
      [lobbyId]
    );
    const participantIds = participantsResult.rows.map(r => Number(r.user_id));
    console.log(`🎮 Starting game #${lobbyId}: ${participantIds.length} players`);

    // Check every participant has at least 1 fact
    const factsResult = await db.query(
      `SELECT id AS "factId", user_id AS "userId" FROM facts WHERE user_id = ANY($1::bigint[])`,
      [participantIds]
    );

    const participantsWithFacts = new Set(factsResult.rows.map(r => Number(r.userId)));
    const missingFacts = participantIds.filter(id => !participantsWithFacts.has(id));

    if (missingFacts.length > 0) {
      const namesResult = await db.query(
        'SELECT id, first_name, username FROM users WHERE id = ANY($1::bigint[])',
        [missingFacts]
      );
      const names = namesResult.rows.map(r => r.first_name || r.username || r.id).join(', ');
      await ctx.reply(
        `❌ Cannot start: some players have no facts.\n\n` +
        `Players without facts: ${names}\n\n` +
        `They need to add at least 1 fact first (just send any text message to the bot).`
      );
      await db.query('UPDATE lobbies SET status = $1 WHERE id = $2', ['waiting', lobbyId]);
      return;
    }

    // Generate nicknames and assign
    const nicknames = generateNicknames(participantIds.length);
    for (let i = 0; i < participantIds.length; i++) {
      await db.query(
        'UPDATE lobby_participants SET nickname = $1 WHERE lobby_id = $2 AND user_id = $3',
        [nicknames[i], lobbyId, participantIds[i]]
      );
    }
    const nicknameMap = {};
    participantIds.forEach((id, i) => { nicknameMap[id] = nicknames[i]; });

    // Distribute facts
    let assignments;
    try {
      assignments = distributeFacts(factsResult.rows, participantIds, lobby.facts_per_player);
    } catch (err) {
      await ctx.reply(
        `❌ Cannot distribute facts: ${err.message}\n\n` +
        `Players: ${participantIds.length}, Total facts: ${factsResult.rows.length}, ` +
        `Facts per player: ${lobby.facts_per_player}\n\n` +
        `Try /edit_lobby ${lobbyId} facts_per_player <smaller number>`
      );
      await db.query('UPDATE lobbies SET status = $1 WHERE id = $2', ['waiting', lobbyId]);
      return;
    }

    // Update lobby status to started
    await db.query('UPDATE lobbies SET status = $1 WHERE id = $2', ['started', lobbyId]);

    // Save assignments with hashes
    const gameSecret = Math.random().toString(36).substring(2, 18);
    await redis.set(`game:${lobbyId}:secret`, gameSecret, 86400);

    for (const assignment of assignments) {
      const authorIdx = participantIds.indexOf(Number(assignment.fromUserId));
      const correctNickname = nicknames[authorIdx];
      const answerHash = crypto
        .createHash('sha256')
        .update(`${assignment.factId}${correctNickname}${gameSecret}`)
        .digest('hex');

      await db.query(
        `INSERT INTO game_assignments (lobby_id, fact_id, assigned_to_user_id, from_user_id, answer_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [lobbyId, assignment.factId, assignment.assignedToUserId, assignment.fromUserId, answerHash]
      );
    }

    // Notify all participants
    let notifiedCount = 0;
    for (const userId of participantIds) {
      const gameToken = generateToken();
      const gameUrl = `https://v2202504269079335176.supersrv.de/game?lobby=${lobbyId}&player=${userId}&token=${gameToken}`;
      await redis.set(`game:${lobbyId}:${userId}:token`, gameToken, 86400);

      // Get this player's assigned facts
      const playerAssignments = assignments.filter(a => Number(a.assignedToUserId) === userId);
      const factContents = await Promise.all(playerAssignments.map(async (a) => {
        const r = await db.query('SELECT content FROM facts WHERE id = $1', [a.factId]);
        return r.rows[0]?.content;
      }));

      let message = `🎮 Game #${lobbyId} started!\n\nYour nickname: ${nicknameMap[userId]}\n\nFacts to guess:\n`;
      factContents.forEach((f, i) => { message += `${i + 1}. ${f}\n`; });
      message += `\nMatch each fact to the right player nickname!\n\n🔗 Play: ${gameUrl}`;

      try {
        await ctx.telegram.sendMessage(userId, message);
        notifiedCount++;
        console.log(`✅ Notified player ${userId}`);
      } catch (err) {
        console.error(`❌ Failed to notify player ${userId}: ${err.message}`);
      }
    }

    await ctx.reply(`✅ Game started! Notified ${notifiedCount}/${participantIds.length} players.`);
  } catch (error) {
    console.error('❌ Error in handleStartGame:', error);
    await ctx.reply(`❌ Error starting game: ${error.message}`);
    await db.query('UPDATE lobbies SET status = $1 WHERE id = $2', ['waiting', lobbyId]).catch(() => {});
  }
}

function generateToken() {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}
