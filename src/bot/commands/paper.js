import { getDb } from '../../db/index.js';

export async function paperCommand(ctx) {
  const db = getDb();
  const userId = ctx.from.id;

  const result = await db.query(
    `UPDATE users SET paper_mode = NOT paper_mode WHERE id = $1 RETURNING paper_mode`,
    [userId]
  );

  const paperMode = result.rows[0]?.paper_mode;

  if (paperMode) {
    await ctx.reply(
      'Ок, ты играешь на бумажке. Когда начнётся игра, распечатай листок с фактами.\n\n' +
      '/paper — отключить бумажный режим'
    );
  } else {
    await ctx.reply(
      'Бумажный режим отключён. Ты получишь ссылку на игру как обычно.\n\n' +
      '/paper — включить обратно'
    );
  }
}
