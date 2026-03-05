import { getDb } from '../../db/index.js';

export async function editLobbyCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];
  const param = args[2];
  const value = args[3];

  if (!lobbyId) {
    const message = `Usage: /edit_lobby <lobby_id> <param> <value>

Examples:
  /edit_lobby 3 facts_per_player 3
  /edit_lobby 3 facts_to_win 5
  /edit_lobby 3 password mypass123

Parameters:
  facts_per_player - Number of facts per player (1-5)
  facts_to_win - Facts needed to win (1-10)
  password - Lobby password (or 'none' to remove)`;

    await ctx.reply(message);
    return;
  }

  if (!param || !value) {
    await ctx.reply(`Usage: /edit_lobby ${lobbyId} <param> <value>\n\nExample: /edit_lobby ${lobbyId} facts_per_player 3`);
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
      await ctx.reply('❌ Only the host can edit the lobby.');
      return;
    }

    if (lobby.status !== 'waiting') {
      await ctx.reply('❌ Can only edit settings while waiting for players.');
      return;
    }

    // Validate and update parameter
    switch (param.toLowerCase()) {
      case 'facts_per_player':
      case 'facts-per-player': {
        const num = parseInt(value);
        if (num < 1 || num > 5) {
          await ctx.reply('❌ facts_per_player must be between 1 and 5.');
          return;
        }
        await db.query('UPDATE lobbies SET facts_per_player = $1 WHERE id = $2', [num, lobbyId]);
        await ctx.reply(`✅ Set facts_per_player to ${num}`);
        break;
      }

      case 'facts_to_win':
      case 'facts-to-win': {
        const num = parseInt(value);
        if (num < 1 || num > 10) {
          await ctx.reply('❌ facts_to_win must be between 1 and 10.');
          return;
        }
        await db.query('UPDATE lobbies SET facts_to_win = $1 WHERE id = $2', [num, lobbyId]);
        await ctx.reply(`✅ Set facts_to_win to ${num}`);
        break;
      }

      case 'password': {
        const newPassword = value === 'none' ? null : value;
        await db.query('UPDATE lobbies SET password = $1 WHERE id = $2', [newPassword, lobbyId]);
        const msg = newPassword ? `✅ Password set to: ${newPassword}` : '✅ Password removed';
        await ctx.reply(msg);
        break;
      }

      default:
        await ctx.reply(`❌ Unknown parameter: ${param}\n\nValid: facts_per_player, facts_to_win, password`);
    }
  } catch (error) {
    console.error('❌ Error editing lobby:', error);
    await ctx.reply('❌ Error editing the lobby. Try again later.');
  }
}
