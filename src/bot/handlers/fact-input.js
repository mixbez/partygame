import { getDb } from '../../db/index.js';

export async function handleFactInput(ctx) {
  const userId = ctx.from.id;
  const factContent = ctx.message.text?.trim();

  if (!factContent || factContent.startsWith('/')) {
    return;
  }

  if (factContent.length < 5 || factContent.length > 500) {
    await ctx.reply(
      '❌ Fact must be between 5 and 500 characters.\n\nExamples:\n• I have visited 15 countries\n• I can speak 3 languages\n• I once met a celebrity',
      { reply_to_message_id: ctx.message.message_id }
    );
    return;
  }

  const db = getDb();

  try {
    // Check existing facts count
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM facts WHERE user_id = $1',
      [userId]
    );

    if (countResult.rows[0].count >= 3) {
      await ctx.reply(
        '✅ You already have 3 facts! That\'s the maximum.\n\nUse /my_facts to view or delete them.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    // Insert fact
    const result = await db.query(
      'INSERT INTO facts (user_id, content) VALUES ($1, $2) RETURNING id',
      [userId, factContent]
    );

    const factsCount = countResult.rows[0].count + 1;

    await ctx.reply(
      `✅ Fact added! (${factsCount}/3)\n\n📝 "${factContent}"\n\n${factsCount === 3 ? '🎉 You\'re all set!' : 'Send another fact or use /my_facts to manage them.'}`,
      { reply_to_message_id: ctx.message.message_id }
    );
  } catch (error) {
    console.error('❌ Error saving fact:', error);
    await ctx.reply(
      '❌ Error saving your fact. Please try again.',
      { reply_to_message_id: ctx.message.message_id }
    );
  }
}
