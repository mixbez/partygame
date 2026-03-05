-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username VARCHAR(255),
  first_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facts table (player-submitted facts)
CREATE TABLE IF NOT EXISTS facts (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lobbies table (game sessions)
CREATE TABLE IF NOT EXISTS lobbies (
  id SERIAL PRIMARY KEY,
  host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password VARCHAR(255),
  facts_per_player INT DEFAULT 2,
  facts_to_win INT DEFAULT 3,
  mode VARCHAR(50) DEFAULT 'online', -- 'online' or 'offline'
  status VARCHAR(50) DEFAULT 'waiting', -- 'waiting', 'generated', 'started', 'finished'
  game_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP
);

-- Lobby participants table
CREATE TABLE IF NOT EXISTS lobby_participants (
  id SERIAL PRIMARY KEY,
  lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(255),
  points INT DEFAULT 0,
  ready BOOLEAN DEFAULT FALSE,
  UNIQUE(lobby_id, user_id)
);

-- Game state for fact distribution
CREATE TABLE IF NOT EXISTS game_assignments (
  id SERIAL PRIMARY KEY,
  lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  fact_id INT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  assigned_to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_hash VARCHAR(255), -- SHA256(factId + correctGameNickname + gameSecret)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player guesses (online mode)
CREATE TABLE IF NOT EXISTS guesses (
  id SERIAL PRIMARY KEY,
  lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  guesser_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_id INT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  guessed_nickname VARCHAR(255),
  is_correct BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
