-- Create lobby_facts table to store facts in lobby context
CREATE TABLE IF NOT EXISTS lobby_facts (
    id SERIAL PRIMARY KEY,
    lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    added_by_host BOOLEAN DEFAULT false,
    source_fact_id INT REFERENCES facts(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lobby_facts_lobby ON lobby_facts(lobby_id);
CREATE INDEX IF NOT EXISTS idx_lobby_facts_user ON lobby_facts(lobby_id, user_id);

-- Clean up old data: delete all game_assignments and lobbies
-- (They are from the old facts-based schema, need to recreate with new lobby_facts schema)
DELETE FROM game_assignments;
DELETE FROM lobbies;

-- Migrate game_assignments to reference lobby_facts instead of facts
ALTER TABLE game_assignments DROP CONSTRAINT IF EXISTS game_assignments_fact_id_fkey;
ALTER TABLE game_assignments ADD CONSTRAINT game_assignments_fact_id_fkey
    FOREIGN KEY (fact_id) REFERENCES lobby_facts(id) ON DELETE CASCADE;
