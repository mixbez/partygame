import { getDb } from '../../db/index.js';

export async function editLobbyCommand(ctx) {
  const args = ctx.message.text.split(' ');
  const lobbyId = args[1];
  const param = args[2];
  const value = args[3];

  if (!lobbyId) {
    const message = `Usage: /edit_lobby <lobby_id> <param> <value>

Parameters:
  facts_per_player - Facts each player gets (default: 10, no max)
  facts_to_win     - Facts needed to win, 1 to facts_per_player (default: 7)
  mode             - online or offline
  password         - set password, or "none" to remove

Examples:
  /edit_lobby 3 facts_per_player 10
  /edit_lobby 3 facts_to_win 5
  /edit_lobby 3 mode offline
  /edit_lobby 3 password secret123
  /edit_lobby 3 password none`;

    await ctx.reply(message);
    return;
  }

  if (!param || !value) {
    await ctx.reply(`Usage: /edit_lobby ${lobbyId} <param> <value>`);
    return;
  }

  const userId = ctx.from.id;
  const db = getDb();

  try {
    const lobbyResult = await db.query(
      'SELECT host_id, status, facts_per_player FROM lobbies WHERE id = $1',
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

    switch (param.toLowerCase()) {
      case 'facts_per_player': {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          await ctx.reply('❌ facts_per_player must be at least 1.');
          return;
        }
        await db.query('UPDATE lobbies SET facts_per_player = $1 WHERE id = $2', [num, lobbyId]);
        await ctx.reply(`✅ facts_per_player set to ${num}`);
        break;
      }

      case 'facts_to_win': {
        const num = parseInt(value);
        const maxFacts = lobby.facts_per_player;
        if (isNaN(num) || num < 1) {
          await ctx.reply('❌ facts_to_win must be at least 1.');
          return;
        }
        if (num > maxFacts) {
          await ctx.reply(`❌ facts_to_win cannot exceed facts_per_player (${maxFacts}).`);
          return;
        }
        await db.query('UPDATE lobbies SET facts_to_win = $1 WHERE id = $2', [num, lobbyId]);
        await ctx.reply(`✅ facts_to_win set to ${num}`);
        break;
      }

      case 'mode': {
        if (!['online', 'offline'].includes(value.toLowerCase())) {
          await ctx.reply('❌ mode must be "online" or "offline".');
          return;
        }
        await db.query('UPDATE lobbies SET mode = $1 WHERE id = $2', [value.toLowerCase(), lobbyId]);
        await ctx.reply(`✅ mode set to ${value.toLowerCase()}`);
        break;
      }

      case 'password': {
        const newPassword = value === 'none' ? null : value;
        await db.query('UPDATE lobbies SET password = $1 WHERE id = $2', [newPassword, lobbyId]);
        await ctx.reply(newPassword ? `✅ Password set to: ${newPassword}` : '✅ Password removed');
        break;
      }

      default:
        await ctx.reply(`❌ Unknown param: "${param}"\n\nValid: facts_per_player, facts_to_win, mode, password`);
    }
  } catch (error) {
    console.error('❌ Error editing lobby:', error);
    await ctx.reply('❌ Error editing the lobby. Try again later.');
  }
}
