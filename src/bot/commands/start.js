export async function startCommand(ctx, attribution) {
  const userName = ctx.from.first_name || 'Friend';

  const message = `
👋 Hi ${userName}! Welcome to Party Game!

${attribution}

How to play:
1. Add facts about yourself
2. Create or join a lobby
3. When the game starts you get others' facts to guess
4. Match each fact to the right player nickname to earn points!

Get started:
/my_facts — add or view your facts (you need at least 1 to play)
/create_lobby — host a new game
/join_lobby <id> — join someone's game
/my_lobbies — see your active lobbies
/help — full guide
  `.trim();

  await ctx.reply(message);
}
