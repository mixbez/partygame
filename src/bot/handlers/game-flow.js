import { getDb } from '../../db/index.js';
import { redis } from '../../redis/index.js';
import { generateNicknames, distributeFacts, validateDistribution } from '../../game/generator.js';

export async function handleStartGame(ctx, lobbyId) {
  const db = getDb();

  try {
    // Update lobby status to started
    await db.query(
      'UPDATE lobbies SET status = $1 WHERE id = $2',
      ['started', lobbyId]
    );

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

    // Get all facts for participants
    const factsResult = await db.query(
      `SELECT id AS "factId", user_id AS "userId"
       FROM facts
       WHERE user_id = ANY($1::bigint[])`,
      [participantIds]
    );

    if (factsResult.rows.length === 0) {
      await ctx.reply('❌ No facts found. Players must add facts before starting.');
      await db.query('UPDATE lobbies SET status = $1 WHERE id = $2', ['waiting', lobbyId]);
      return;
    }

    // Generate nicknames
    const nicknames = generateNicknames(participantIds.length);
    for (let i = 0; i < participantIds.length; i++) {
      await db.query(
        'UPDATE lobby_participants SET nickname = $1 WHERE lobby_id = $2 AND user_id = $3',
        [nicknames[i], lobbyId, participantIds[i]]
      );
    }

    // Distribute facts
    let assignments;
    try {
      assignments = distributeFacts(factsResult.rows, participantIds, lobby.facts_per_player);
    } catch (err) {
      const playerCount = participantIds.length;
      const factCount = factsResult.rows.length;
      await ctx.reply(
        `❌ Cannot distribute facts: ${err.message}\n\n` +
        `Players: ${playerCount}, Total facts: ${factCount}, Facts per player needed: ${lobby.facts_per_player}\n\n` +
        `Each player needs enough facts from others. Use /edit_lobby ${lobbyId} facts_per_player <lower number>.`
      );
      await db.query('UPDATE lobbies SET status = $1 WHERE id = $2', ['waiting', lobbyId]);
      return;
    }

    // Save assignments with answer hashes
    const gameSecret = Math.random().toString(36).substring(2, 18);
    await redis.set(`game:${lobbyId}:secret`, gameSecret, 86400);

    for (const assignment of assignments) {
      // Find nickname of the fact author
      const authorIdx = participantIds.indexOf(Number(assignment.fromUserId));
      const correctNickname = nicknames[authorIdx];
      const crypto = await import('crypto');
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

    // Build nickname map for participant messages
    const nicknameMap = {};
    participantIds.forEach((id, i) => { nicknameMap[id] = nicknames[i]; });

    // Notify all participants
    let notifiedCount = 0;
    for (const userId of participantIds) {
      const gameToken = generateToken();
      const gameUrl = `https://v2202504269079335176.supersrv.de/game?lobby=${lobbyId}&player=${userId}&token=${gameToken}`;
      await redis.set(`game:${lobbyId}:${userId}:token`, gameToken, 86400);

      // Get this player's assigned facts
      const playerAssignments = assignments.filter(a => Number(a.assignedToUserId) === userId);
      const playerFacts = await Promise.all(playerAssignments.map(async (a) => {
        const factRes = await db.query('SELECT content FROM facts WHERE id = $1', [a.factId]);
        return factRes.rows[0]?.content;
      }));

      const myNickname = nicknameMap[userId];
      let message = `🎮 Game Started!\n\nYour nickname: ${myNickname}\n\nYour facts to guess:\n`;
      playerFacts.forEach((f, i) => {
        message += `${i + 1}. ${f}\n`;
      });
      message += `\nMatch each fact to the right nickname to earn points!`;

      if (lobby.mode !== 'online') {
        message += `\n\nOffline mode link: ${gameUrl}`;
      }

      try {
        await ctx.telegram.sendMessage(userId, message);
        notifiedCount++;
      } catch (err) {
        console.error(`❌ Failed to notify participant ${userId}:`, err.message);
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
