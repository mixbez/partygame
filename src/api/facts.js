import { getDb } from '../db/index.js';

export async function setupFactsRoutes(app) {
  const db = getDb();

  // Get user's facts
  app.get('/api/partygame/facts/:userId', async (request, reply) => {
    const { userId } = request.params;

    try {
      const result = await db.query(
        'SELECT id, content, created_at FROM facts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
        [userId]
      );

      return { facts: result.rows };
    } catch (error) {
      console.error('❌ Error fetching facts:', error);
      reply.code(500);
      return { error: 'Failed to fetch facts' };
    }
  });

  // Add new fact
  app.post('/api/partygame/facts', async (request, reply) => {
    const { userId, content } = request.body;

    if (!userId || !content) {
      reply.code(400);
      return { error: 'Missing userId or content' };
    }

    if (content.length < 5 || content.length > 500) {
      reply.code(400);
      return { error: 'Fact must be between 5 and 500 characters' };
    }

    try {
      // Check existing facts count
      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM facts WHERE user_id = $1',
        [userId]
      );

      if (countResult.rows[0].count >= 3) {
        reply.code(400);
        return { error: 'Maximum 3 facts allowed' };
      }

      const result = await db.query(
        'INSERT INTO facts (user_id, content) VALUES ($1, $2) RETURNING id, content, created_at',
        [userId, content]
      );

      return { fact: result.rows[0] };
    } catch (error) {
      console.error('❌ Error creating fact:', error);
      reply.code(500);
      return { error: 'Failed to create fact' };
    }
  });

  // Delete fact
  app.delete('/api/partygame/facts/:factId', async (request, reply) => {
    const { factId } = request.params;

    try {
      const result = await db.query(
        'DELETE FROM facts WHERE id = $1 RETURNING id',
        [factId]
      );

      if (result.rows.length === 0) {
        reply.code(404);
        return { error: 'Fact not found' };
      }

      return { ok: true };
    } catch (error) {
      console.error('❌ Error deleting fact:', error);
      reply.code(500);
      return { error: 'Failed to delete fact' };
    }
  });
}
