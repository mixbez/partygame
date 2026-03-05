-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_facts_user_id ON facts(user_id);
CREATE INDEX IF NOT EXISTS idx_lobbies_host_id ON lobbies(host_id);
CREATE INDEX IF NOT EXISTS idx_lobbies_status ON lobbies(status);
CREATE INDEX IF NOT EXISTS idx_lobby_participants_lobby_id ON lobby_participants(lobby_id);
CREATE INDEX IF NOT EXISTS idx_lobby_participants_user_id ON lobby_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_game_assignments_lobby_id ON game_assignments(lobby_id);
CREATE INDEX IF NOT EXISTS idx_game_assignments_fact_id ON game_assignments(fact_id);
CREATE INDEX IF NOT EXISTS idx_guesses_lobby_id ON guesses(lobby_id);
CREATE INDEX IF NOT EXISTS idx_guesses_guesser_id ON guesses(guesser_id);
