export async function startCommand(ctx, attribution) {
  const userName = ctx.from.first_name || 'Friend';

  const message = `
👋 Welcome to Party Game, ${userName}!

${attribution}

🎮 Party Game is a fun game where you submit facts about yourself and try to guess who submitted each fact!

**Menu:**
/my_facts - Add or manage your facts
/create_lobby - Create a new game session
/join_lobby - Join an existing game
/my_lobbies - View your hosted games
/help - Show help

Ready to play? Use the commands above to get started! 🎉
  `.trim();

  await ctx.reply(message);
}
