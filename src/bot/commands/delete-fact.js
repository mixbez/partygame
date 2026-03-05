import { getDb } from '../../db/index.js';

export async function deleteFactCommand(ctx) {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const factId = args[1];

  if (!factId) {
    await ctx.reply('Usage: /delete_fact <fact_id>\n\nExample: /delete_fact 5');
    return;
  }

  const db = getDb();

  try {
    // Check if fact belongs to user
    const factResult = await db.query(
      'SELECT user_id FROM facts WHERE id = $1',
      [factId]
    );

    if (factResult.rows.length === 0) {
      await ctx.reply('❌ Fact not found.');
      return;
    }

    if (factResult.rows[0].user_id !== userId) {
      await ctx.reply('❌ You can only delete your own facts.');
      return;
    }

    // Delete fact
    await db.query('DELETE FROM facts WHERE id = $1', [factId]);

    await ctx.reply('✅ Fact deleted!');
  } catch (error) {
    console.error('❌ Error deleting fact:', error);
    await ctx.reply('❌ Error deleting fact. Try again later.');
  }
}
