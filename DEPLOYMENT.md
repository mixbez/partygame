# Party Game Bot - Deployment Checklist

## ✅ Completed Implementation

### Phase 1: Project Setup ✓
- [x] Created `/opt/partygame` directory structure
- [x] Created `package.json` with dependencies
- [x] Created `Dockerfile` (Node.js 20 Alpine)
- [x] Created `.env` and `.env.example`
- [x] Set up `.gitignore`

### Phase 2: Database Setup ✓
- [x] Created migration: `001_initial.sql` (users, facts, lobbies, participants, game_assignments)
- [x] Created migration: `002_indexes.sql` (performance indexes)
- [x] Created `src/db/index.js` (PostgreSQL connection + migrations runner)

### Phase 3: Core Services ✓
- [x] Created `src/redis/index.js` (Redis client with namespace prefix)
- [x] Created `src/index.js` (Fastify + Telegraf server)

### Phase 4: Game Logic ✓
- [x] Created `src/game/generator.js`:
  - Nickname generation (Russian adjectives + nouns)
  - Fact distribution algorithm
  - Distribution validation
- [x] No player gets their own fact ✓
- [x] No duplicate facts from same source ✓
- [x] Fair distribution ✓

### Phase 5: Bot Commands ✓
- [x] `/start` - Welcome message with menu
- [x] `/my_facts` - Manage personal facts (view/delete)
- [x] `/create_lobby` - Create new game session
- [x] `/join_lobby <id>` - Join existing game
- [x] `/my_lobbies` - View active games
- [x] `/help` - Game instructions
- [x] Text input handler - Add facts directly via messages
- [x] Error handling & middleware

### Phase 6: API Endpoints ✓
**Lobbies:**
- [x] `GET /api/partygame/lobbies` - List active lobbies
- [x] `GET /api/partygame/lobbies/:id` - Get lobby details
- [x] `POST /api/partygame/lobbies/:id/start` - Start game + distribute facts

**Facts:**
- [x] `GET /api/partygame/facts/:userId` - Get user's facts
- [x] `POST /api/partygame/facts` - Add new fact
- [x] `DELETE /api/partygame/facts/:factId` - Delete fact

**Game (Offline Mode):**
- [x] `GET /api/partygame/game/:lobbyId/:playerId/:token` - Fetch game data
- [x] `POST /api/partygame/game/:lobbyId/:playerId/:token/validate` - Validate guess

**Game (Online Mode):**
- [x] `POST /api/partygame/lobbies/:lobbyId/guess` - Submit guess

### Phase 7: React Frontend ✓
- [x] `frontend/package.json` with React + Vite
- [x] `frontend/index.html` - Entry point
- [x] React components:
  - [x] `App.jsx` - Main app
  - [x] `GameScreen.jsx` - Game play
  - [x] `FactCard.jsx` - Fact display
  - [x] `NicknameSelector.jsx` - Answer selection
  - [x] `ScoreBoard.jsx` - Player scores
  - [x] `LoadingScreen.jsx` - Loading state
  - [x] `ErrorScreen.jsx` - Error handling
  - [x] `VictoryScreen.jsx` - Win screen
- [x] `frontend/Dockerfile` - Multi-stage build
- [x] `frontend/nginx.conf` - Static serving

### Phase 8: Infrastructure Integration ✓
- [x] Updated `/opt/comparity/docker-compose.yml`:
  - Added `backend-partygame` service
  - Connected to `postgres` and `redis`
  - Updated Caddy `depends_on`
- [x] Updated `/opt/comparity/Caddyfile`:
  - Added `/pg-webhook` route
  - Added `/api/partygame/*` route
- [x] Updated `/opt/comparity/.env`:
  - Added `PARTYGAME_BOT_TOKEN`
  - Added `PARTYGAME_DB_PASS`

## 🚀 Deployment Steps

### Step 1: Create PostgreSQL Database
```bash
# Connect to PostgreSQL and run:
CREATE DATABASE partygame;
```

### Step 2: Build Docker Image
```bash
cd /opt/partygame
docker build -t partygame:latest . --no-cache
```

### Step 3: Verify Docker Compose
```bash
cd /opt/comparity
docker-compose config | grep -A 15 backend-partygame
```

### Step 4: Start Service
```bash
cd /opt/comparity
docker-compose up -d backend-partygame
```

### Step 5: Check Logs
```bash
docker-compose logs -f backend-partygame
```

Expected output:
```
🚀 Starting Party Game Bot...
📡 Initializing services...
✅ Services initialized
🤖 Initializing Telegram bot...
✅ Bot initialized
📍 Registering API routes...
✅ API routes registered
✅ Server listening on port 3002
```

## 🧪 Testing Checklist

### Bot Commands
- [ ] `/start` - Shows welcome message
- [ ] `/help` - Shows game instructions
- [ ] `/my_facts` - Shows empty facts list initially
- [ ] Add fact via text message - Fact saved
- [ ] `/my_facts` - Shows 1/3 facts
- [ ] Add 2 more facts
- [ ] `/my_facts` - Shows 3/3 facts (max reached)
- [ ] `/create_lobby` - Creates lobby, shows ID
- [ ] `/my_lobbies` - Shows hosted lobby
- [ ] `/join_lobby <id>` - Joins existing lobby

### Game Generation
- [ ] Lobby starts with 2+ players
- [ ] Nicknames assigned to each player
- [ ] Facts distributed fairly
- [ ] No player gets own fact
- [ ] No duplicate facts from same source

### API Endpoints
- [ ] `GET /api/partygame/lobbies` - Returns list
- [ ] `POST /api/partygame/lobbies/1/start` - Starts game
- [ ] `GET /api/partygame/game/1/123/token` - Returns game data
- [ ] Hash validation works correctly

### Frontend Offline Mode
- [ ] Load game with valid token
- [ ] Display facts to guess
- [ ] Show participant nicknames
- [ ] Select nickname for each fact
- [ ] Hash validation passes for correct guesses
- [ ] Victory screen shows on win

### Infrastructure
- [ ] Caddy routes traffic correctly
- [ ] Database persists data
- [ ] Redis cache works
- [ ] Existing services (Comparity, WriterShadow, Flight Deals) still work
- [ ] No port conflicts

## 📊 Service Architecture

```
Internet
   ↓
Caddy (443, 80)
   ├─ /webhook → backend (3000)
   ├─ /ws-webhook → backend-writershadow (3001)
   ├─ /webhook-flightdeals → backend-flightdeals (8080)
   ├─ /pg-webhook → backend-partygame (3002) ✨ NEW
   ├─ /api/partygame/* → backend-partygame (3002) ✨ NEW
   ├─ /api/* → backend (3000)
   └─ * → frontend (80)

backend-partygame (3002)
   ├─ postgres
   └─ redis
```

## 🔐 Security Notes

- Bot token stored in environment variable
- Database passwords in `.env` (not committed)
- Offline mode uses SHA256 hashing for answer validation
- Webhook verification via Telegram
- Database queries use parameterized statements (SQL injection prevention)

## 📝 Environment Variables

```env
PARTYGAME_BOT_TOKEN=8716383952:AAFP-EY_NjId-ux6t5ZNMv3KaEuTdWC7Wzg
BOT_WEBHOOK_URL=https://v2202504269079335176.supersrv.de
DATABASE_URL=postgresql://partygame:partygame_pass_secure@postgres:5432/partygame
REDIS_URL=redis://redis:6379
REDIS_KEY_PREFIX=partygame:
PORT=3002
NODE_ENV=production
ATTRIBUTION=by aboutmisha.com
```

## 🔗 Important Links

- **Webhook URL:** https://v2202504269079335176.supersrv.de/pg-webhook
- **API Base:** https://v2202504269079335176.supersrv.de/api/partygame
- **Game URL Pattern:** https://v2202504269079335176.supersrv.de/game?lobby=<id>&player=<userId>&token=<token>

## 📞 Support

For issues:
1. Check logs: `docker-compose logs backend-partygame`
2. Verify database: `psql -d partygame -c "SELECT COUNT(*) FROM lobbies;"`
3. Test Redis: `redis-cli PING`
4. Check webhook: `curl https://v2202504269079335176.supersrv.de/pg-webhook`

## ✨ Attribution

Party Game Bot - by aboutmisha.com
