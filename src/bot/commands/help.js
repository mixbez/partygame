export async function helpCommand(ctx, attribution) {
  const message = `
📖 **Help - How to Play**

**What is Party Game?**
Party Game is a social game where players submit interesting facts about themselves, then try to guess who submitted each fact!

${attribution}

**Game Flow:**
1️⃣ Add facts about yourself (/my_facts)
2️⃣ Create or join a lobby (game session)
3️⃣ Other players submit their facts
4️⃣ Match facts to players and earn points!

**Commands:**
/my_facts - Manage your 3 personal facts
/create_lobby - Start a new game
  • Set password (optional)
  • Set facts per player
  • Set facts needed to win
  • Choose online or offline mode
/join_lobby - Join existing game by ID or password
/my_lobbies - View your active game sessions
/help - Show this help message

**Game Rules:**
• Each player can submit up to 3 facts
• No fact can be your own
• Players match facts to nicknames
• First to reach target points wins!

**Modes:**
• **Online:** Play with others in real-time
• **Offline:** Play solo with hash-based validation

Have fun! 🎮
  `.trim();

  await ctx.reply(message);
}
