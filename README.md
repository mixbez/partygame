# Party Game Bot 🎮

A fun social game where players submit facts about themselves and try to guess who submitted each fact!

## Features

- 🤖 **Telegram Bot** - Full game control via Telegram commands
- 👥 **Multiplayer** - Host lobbies and invite friends
- 📝 **Personal Facts** - Add up to 3 personal facts
- 🎯 **Smart Distribution** - Fair fact distribution algorithm
- 🔐 **Secure Offline Mode** - Play with hash-based validation
- 🎨 **React Frontend** - Beautiful UI for offline gameplay

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 16
- Redis 7

### Deploy

1. Build the service:
```bash
cd /opt/partygame
docker build -t partygame:latest .
```

2. Update environment in `/opt/comparity/.env`:
```
PARTYGAME_BOT_TOKEN=your_token_here
PARTYGAME_DB_PASS=secure_password
```

3. Start with docker-compose:
```bash
cd /opt/comparity
docker-compose up -d backend-partygame
```

## Usage

### For Players

1. `/start` - Start the bot
2. `/my_facts` - Manage your personal facts
3. `/create_lobby` - Host a new game
4. `/join_lobby <id>` - Join an existing game
5. `/help` - Get help

### Game Flow

1. **Setup** - Host creates lobby, players join
2. **Facts** - Each player adds their facts
3. **Start** - Host starts the game
4. **Play** - Players guess who wrote each fact
5. **Win** - First to reach target points wins!

## Architecture

```
Backend: Node.js + Fastify + Telegraf
Database: PostgreSQL
Cache: Redis
Frontend: React + Vite + TailwindCSS
Webhook: Caddy reverse proxy
```

## Database Schema

- `users` - Telegram users
- `facts` - Player-submitted facts
- `lobbies` - Game sessions
- `lobby_participants` - Players in each lobby
- `game_assignments` - Fact distribution
- `guesses` - Player guesses (online mode)

## API Routes

### Game Management
- `GET /api/partygame/lobbies` - List active lobbies
- `GET /api/partygame/lobbies/:id` - Get lobby details
- `POST /api/partygame/lobbies/:id/start` - Start game

### Facts
- `GET /api/partygame/facts/:userId` - Get user's facts
- `POST /api/partygame/facts` - Add new fact
- `DELETE /api/partygame/facts/:factId` - Delete fact

### Gameplay
- `GET /api/partygame/game/:lobbyId/:playerId/:token` - Get game data
- `POST /api/partygame/game/:lobbyId/:playerId/:token/validate` - Validate guess

## Configuration

Environment variables:
- `PARTYGAME_BOT_TOKEN` - Telegram bot token
- `BOT_WEBHOOK_URL` - Webhook base URL
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `REDIS_KEY_PREFIX` - Cache key prefix
- `PORT` - Server port (default: 3002)
- `ATTRIBUTION` - Credit message

## Development

```bash
# Install dependencies
npm install

# Run with hot reload
npm run dev

# Build frontend
cd frontend && npm run build

# Run migrations
npm run migrate
```

## Attribution

🎮 Party Game - by aboutmisha.com
