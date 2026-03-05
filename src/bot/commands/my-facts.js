import { getDb } from '../../db/index.js';

export async function myFactsCommand(ctx) {
  const userId = ctx.from.id;
  const db = getDb();

  try {
    // Get user's facts
    const result = await db.query(
      'SELECT id, content FROM facts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
      [userId]
    );

    const facts = result.rows;

    if (facts.length === 0) {
      await ctx.reply('📝 You haven\'t added any facts yet!\n\nSend me your facts one by one. Each fact should be interesting and true!\n\nMax 3 facts allowed.');
      return;
    }

    let message = `📝 Your Facts (${facts.length}/3):\n\n`;
    facts.forEach((fact, index) => {
      message += `${index + 1}. ${fact.content}\n`;
      message += `   /delete_fact ${fact.id}\n\n`;
    });

    message += 'Send a new fact to add more (up to 3 total)';

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error in my_facts:', error);
    await ctx.reply('❌ Error loading your facts. Try again later.');
  }
}
