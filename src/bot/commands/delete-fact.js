import { getDb } from '../../db/index.js';

export async function deleteFactCommand(ctx) {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const factNum = parseInt(args[1]);

  if (!factNum || factNum < 1 || factNum > 3) {
    await ctx.reply('Usage: /delete_fact <1|2|3>\n\nUse /my_facts to see your facts numbered 1-3.');
    return;
  }

  const db = getDb();

  try {
    // Get user's facts ordered the same way as /my_facts displays them
    const factsResult = await db.query(
      'SELECT id FROM facts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
      [userId]
    );

    if (factsResult.rows.length === 0) {
      await ctx.reply('❌ You have no facts to delete.');
      return;
    }

    if (factNum > factsResult.rows.length) {
      await ctx.reply(`❌ You only have ${factsResult.rows.length} fact(s). Use /my_facts to see them.`);
      return;
    }

    // factNum is 1-based, array is 0-based
    const factId = factsResult.rows[factNum - 1].id;

    await db.query('DELETE FROM facts WHERE id = $1 AND user_id = $2', [factId, userId]);

    await ctx.reply(`✅ Fact #${factNum} deleted!`);
  } catch (error) {
    console.error('❌ Error deleting fact:', error);
    await ctx.reply('❌ Error deleting fact. Try again later.');
  }
}
