import { getDb } from '../../db/index.js';

export async function startGameCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];

  if (!lobbyId) {
    await ctx.reply('Usage: /start_game <lobby_id>\n\nExample: /start_game 3');
    return;
  }

  const userId = ctx.from.id;
  const db = getDb();

  try {
    // Check if user is host
    const lobbyResult = await db.query(
      'SELECT host_id, status FROM lobbies WHERE id = $1',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      await ctx.reply('❌ Lobby not found.');
      return;
    }

    const lobby = lobbyResult.rows[0];

    if (Number(lobby.host_id) !== userId) {
      await ctx.reply('❌ Only the host can start the game.');
      return;
    }

    // Check if host is a participant in the lobby
    const hostParticipantResult = await db.query(
      'SELECT id FROM lobby_participants WHERE lobby_id = $1 AND user_id = $2',
      [lobbyId, userId]
    );

    if (hostParticipantResult.rows.length === 0) {
      await ctx.reply(
        `❌ Host must join the lobby to start the game.\n\n` +
        `Use: /join_lobby ${lobbyId}`
      );
      return;
    }

    // Check if game is in 'generated' state (pre-generated via dashboard)
    if (lobby.status === 'waiting') {
      await ctx.reply(
        `❌ Game has not been generated yet.\n\n` +
        `Please generate the game using the host dashboard first:\n` +
        `${process.env.BOT_WEBHOOK_URL}/game/host/${lobbyId}`
      );
      return;
    }

    if (lobby.status !== 'generated') {
      await ctx.reply(`❌ Game is already ${lobby.status}. Can't start again.`);
      return;
    }

    // Get participants with game URLs
    const participantsResult = await db.query(
      `SELECT user_id, game_url, nickname FROM lobby_participants WHERE lobby_id = $1`,
      [lobbyId]
    );

    const participants = participantsResult.rows;

    if (participants.length < 2) {
      await ctx.reply('❌ Lobby has less than 2 players.');
      return;
    }

    // Get facts for this lobby (for the message)
    const factsResult = await db.query(
      `SELECT DISTINCT lf.content FROM game_assignments ga
       JOIN lobby_facts lf ON ga.fact_id = lf.id
       WHERE ga.lobby_id = $1
       LIMIT 3`,
      [lobbyId]
    );

    // Send game links to all participants
    let notifiedCount = 0;
    for (const participant of participants) {
      try {
        let message = `🎮 Game #${lobbyId} started!\n\n`;
        message += `Your nickname: ${participant.nickname}\n\n`;
        message += `Facts to guess:\n`;

        // Get this player's facts
        const playerFactsResult = await db.query(
          `SELECT f.content FROM game_assignments ga
           JOIN lobby_facts lf ON ga.fact_id = lf.id
           WHERE ga.lobby_id = $1 AND ga.assigned_to_user_id = $2
           ORDER BY ga.id ASC`,
          [lobbyId, participant.user_id]
        );

        playerFactsResult.rows.forEach((f, i) => {
          message += `${i + 1}. ${f.content}\n`;
        });

        message += `\nMatch each fact to the right player nickname!\n\n`;
        message += `🔗 Play: ${participant.game_url}`;

        await ctx.telegram.sendMessage(participant.user_id, message);
        notifiedCount++;
        console.log(`✅ Notified player ${participant.user_id}`);
      } catch (err) {
        console.error(`❌ Failed to notify player ${participant.user_id}: ${err.message}`);
      }
    }

    // Update lobby status to 'started'
    await db.query(
      'UPDATE lobbies SET status = $1, started_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['started', lobbyId]
    );

    await ctx.reply(`✅ Game started! Notified ${notifiedCount}/${participants.length} players.`);
  } catch (error) {
    console.error('❌ Error starting game:', error);
    await ctx.reply('❌ Error starting the game. Try again later.');
  }
}
