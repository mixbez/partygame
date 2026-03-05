ALTER TABLE game_assignments ADD COLUMN IF NOT EXISTS from_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_game_assignments_from_user_id ON game_assignments(from_user_id);
