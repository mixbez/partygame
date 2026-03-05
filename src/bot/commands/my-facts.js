import { getDb } from '../../db/index.js';

export async function myFactsCommand(ctx) {
  const userId = ctx.from.id;
  const db = getDb();

  try {
    const result = await db.query(
      'SELECT id, content FROM facts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
      [userId]
    );

    const facts = result.rows;

    if (facts.length === 0) {
      await ctx.reply(
        '📝 You have no facts yet.\n\n' +
        'Just send me any text message and it will be saved as a fact.\n' +
        'You can add up to 3 facts total.'
      );
      return;
    }

    let message = `📝 Your facts (${facts.length}/3):\n\n`;
    facts.forEach((fact, index) => {
      message += `${index + 1}. ${fact.content}\n`;
      message += `   /delete_fact ${index + 1}\n\n`;
    });

    if (facts.length < 3) {
      message += 'Send a text message to add another fact.';
    } else {
      message += 'Maximum 3 facts reached. Delete one to add another.';
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('❌ Error in my_facts:', error);
    await ctx.reply('❌ Error loading your facts. Try again later.');
  }
}
