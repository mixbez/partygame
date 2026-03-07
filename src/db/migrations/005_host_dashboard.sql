-- Add excluded_facts table to track facts removed by host
CREATE TABLE IF NOT EXISTS excluded_facts (
  id SERIAL PRIMARY KEY,
  lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  fact_id INT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lobby_id, fact_id)
);

-- Add game_token and game_url to lobby_participants
ALTER TABLE lobby_participants
ADD COLUMN IF NOT EXISTS game_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS game_url TEXT;

-- Create index for excluded facts lookup
CREATE INDEX IF NOT EXISTS idx_excluded_facts_lobby ON excluded_facts(lobby_id);
