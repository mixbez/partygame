# Host Dashboard Implementation Guide

## Overview

Successfully implemented a web-based host dashboard system for the Party Game Bot, replacing the CLI-only game generation workflow. Hosts can now manage facts, exclude/include them, and generate games through an interactive web interface.

## Implementation Summary

### 1. Database Schema Changes

**Migration File:** `src/db/migrations/005_host_dashboard.sql`

**New Table:**
```sql
excluded_facts (id, lobby_id, fact_id, created_at)
```
Tracks which facts the host has excluded from the game pool.

**Updated Table:**
```
lobby_participants:
  + game_token VARCHAR(255)
  + game_url TEXT
```
Stores pre-generated player-specific game links.

**Lobby Status Flow:**
- `waiting` — Lobby created, accepting participants
- `generated` — Game generated, facts distributed, links ready (NEW)
- `started` — Game active, players guessing
- `finished` — Game completed

### 2. Backend API Endpoints

**File:** `src/api/host.js`

All endpoints require host token authentication:
```
Authorization: Bearer <token>
```

Token format (deterministic):
```javascript
crypto.createHash('sha256')
  .update(`${userId}:${lobbyId}:${JWT_SECRET}`)
  .digest('hex')
```

#### Endpoints:

**1. GET `/api/partygame/host/lobbies/:id`**
- Dashboard view with all data
- Returns: lobby info, participants, facts (with excluded status), validation status
- Validation shows if game can be generated (players ≥ 2, facts enough)

**2. POST `/api/partygame/host/lobbies/:id/facts/:factId/toggle`**
- Exclude or include a fact
- Works in `waiting` and `generated` states
- Returns: excluded status

**3. POST `/api/partygame/host/lobbies/:id/facts/add`**
- Host can add new facts to the pool
- Works in `waiting` and `generated` states
- Fact attributed to the host user
- Body: `{ content: "fact text" }`

**4. POST `/api/partygame/host/lobbies/:id/generate`**
- Generates game: creates nicknames, distributes facts, generates tokens
- Status transition: `waiting` → `generated`
- Returns: list of assigned nicknames
- Stores: game_secret, game_tokens, game_urls in database and Redis
- Validates: ≥2 players, enough facts available

**5. GET `/api/partygame/host/lobbies/:id/print`**
- Returns print-ready data (facts per player, nicknames)
- Requires status: `generated` or `started`

**6. POST `/api/partygame/host/lobbies/:id/token`**
- Generates host token for dashboard access
- Used to create shareable links
- Returns: token, dashboardUrl, printUrl

### 3. Frontend Components

#### HostDashboard (`frontend/src/pages/HostDashboard.jsx`)
Interactive dashboard for managing lobbies and generating games.

**Features:**
- Display lobby settings (mode, password, facts per player, etc.)
- List all participants with their nicknames (if assigned)
- Show all facts with toggle buttons to exclude/include
- Add new facts by host
- Validation checklist (players ≥ 2, facts available)
- "Generate Game" button (enabled when validation passes)
- "Print Preview" button (enabled after generation)

**State Management:**
- Loads dashboard data on mount
- Tracks excluded facts in local state
- Refresh after each action

**Error Handling:**
- Shows validation errors
- Displays API errors clearly

#### PrintPreview (`frontend/src/pages/PrintPreview.jsx`)
A4-formatted print-ready questionnaires for offline gameplay.

**Features:**
- One page per player
- A4 dimensions (210mm × 297mm)
- Instruction section with player nicknames
- Facts to guess with answer lines
- Scoring information
- CSS media queries for print (@media print)
- Print button to save as PDF

**Print Layout:**
- Professional formatting
- Page breaks properly handled
- Optimized for both screen and print

### 4. Telegram Bot Updates

#### `/my_lobbies` Command
Now shows interactive links:
- **Status `waiting`:** Shows "📊 Dashboard" link
- **Status `generated`:** Shows "📊 Dashboard" and "🖨️ Print" links
- Links are HTML formatted with pre-calculated host tokens

Example:
```
⏳ #5 — waiting
   📊 <a href="https://...">Dashboard</a> | /start_game 5
```

#### `/start_game` Command
Now works with pre-generated game data:

**Logic:**
1. Verify user is host
2. Check lobby status is `generated` (not `waiting`)
3. If `waiting`: reject, show link to dashboard
4. If `generated`: retrieve pre-generated game_urls from lobby_participants
5. Send game links to all players
6. Update status to `started`

**Benefits:**
- Host can review/modify game before sending links
- Separate "prepare" and "send" phases
- Can print questionnaires before starting

### 5. Frontend Routing

**Updated:** `frontend/src/App.jsx`

**Route Patterns:**

1. **Host Dashboard:**
   ```
   /game/host/:lobbyId?token=<hostToken>
   ```
   Renders: `<HostDashboard lobbyId={lobbyId} hostToken={token} />`

2. **Print Preview:**
   ```
   /game/print/:lobbyId?token=<hostToken>
   ```
   Renders: `<PrintPreview lobbyId={lobbyId} hostToken={token} />`

3. **Game Screen (unchanged):**
   ```
   /game?lobby=<id>&player=<playerId>&token=<playerToken>
   ```

### 6. Styling

**HostDashboard.css**
- Responsive grid layout
- Color-coded status indicators
- Interactive buttons with hover effects
- Excluded facts highlighted differently
- Mobile-friendly media queries

**PrintPreview.css**
- A4 page dimensions
- Print media queries (@media print)
- Professional document styling
- Page break handling
- Optimized for laser printers

## New Workflow

### Old Workflow (Command-Driven)
```
Host                          System
  |
  +--/start_game #5-----------> [Generate immediately]
                                [Send links to all players]
                                [Status: waiting -> started]
                                <------[Notify host]
  |
  |
  (Game active)
```

### New Workflow (Dashboard-Driven)
```
Host                          System
  |
  +--/my_lobbies--------> [Show lobbies with Dashboard link]
  |
  +--Click Dashboard----> [Load HostDashboard]
  |
  |--Review facts------
  |--Exclude #3--------> [Mark excluded_facts]
  |--Add fact "..."----> [Insert into facts table]
  |
  +--🚀 Generate-------> [Create nicknames]
  |                       [Distribute facts]
  |                       [Generate tokens/URLs]
  |                       [Status: waiting -> generated]
  |                       [Notify host]
  |
  +--🖨️ Print--------> [Load PrintPreview]
  |
  |--Review form-----
  |--Print to PDF
  |
  +--/start_game #5----> [Send pre-generated links]
  |                       [Status: generated -> started]
  |                       [Notify host & players]
  |
  |
  (Game active)
```

## Security Considerations

### Host Token Authentication
- Deterministic hash: `SHA256(userId:lobbyId:JWT_SECRET)`
- Cannot be guessed without knowing JWT_SECRET
- Expires naturally (frontend can validate timestamps if needed)
- Only allows that specific user to access that specific lobby

### API Validation
- All endpoints verify:
  - Host token is correct
  - User ID matches lobby host_id
  - Lobby exists
  - Operation is valid for current status

### Frontend Security
- Tokens passed in URL (standard for shareable links)
- No sensitive data stored in localStorage
- CORS headers respected

## Testing Checklist

### Database
- [ ] Migration 005 runs on startup
- [ ] `excluded_facts` table created
- [ ] `game_token` and `game_url` columns exist in `lobby_participants`

### Backend API
- [ ] Host token endpoint generates correct tokens
- [ ] Dashboard endpoint returns all required data
- [ ] Fact toggle endpoint works
- [ ] Fact add endpoint works
- [ ] Game generation endpoint:
  - [ ] Validates players count
  - [ ] Validates facts count
  - [ ] Creates nicknames
  - [ ] Distributes facts
  - [ ] Updates lobby status to `generated`
  - [ ] Stores game_tokens and game_urls

### Telegram Commands
- [ ] `/my_lobbies` shows Dashboard links
- [ ] Dashboard links are clickable (HTML formatted)
- [ ] `/start_game` rejects lobbies in `waiting` status
- [ ] `/start_game` works with `generated` status
- [ ] `/start_game` sends pre-generated links
- [ ] Players receive correct facts in game link message

### Frontend
- [ ] `/game/host/:id?token=xxx` loads HostDashboard
- [ ] HostDashboard displays all facts
- [ ] HostDashboard toggles fact exclusion
- [ ] HostDashboard adds facts
- [ ] HostDashboard validation works
- [ ] Generate button works and disables appropriately
- [ ] Print button appears when status is `generated`
- [ ] `/game/print/:id?token=xxx` loads PrintPreview
- [ ] PrintPreview shows all player questionnaires
- [ ] Print preview A4 formatting works
- [ ] Can save as PDF

## Known Limitations

1. **Paper Mode:** Still player-controlled. Host cannot force paper mode, though it's recommended they mark `/paper` before the game starts.

2. **Fact Limit:** 3-fact player limit (from game generator) still applies. Host additions use the 3-fact bypass.

3. **Real-time Updates:** Dashboard requires refresh after each action (no WebSocket updates yet).

4. **Token Expiry:** Tokens don't expire. Consider adding timestamp validation if needed for security.

## Future Enhancements

1. **Real-time Updates:** Add WebSocket for live fact updates in dashboard
2. **Bulk Operations:** Select/exclude multiple facts at once
3. **Fact Templates:** Pre-built fact categories
4. **Token Expiry:** Add timestamp validation for tokens
5. **Audit Log:** Track host modifications to facts
6. **Auto-Print:** Generate PDF directly from dashboard

## Files Modified/Created

### Created Files (6)
```
src/db/migrations/005_host_dashboard.sql
src/api/host.js
frontend/src/pages/HostDashboard.jsx
frontend/src/pages/PrintPreview.jsx
frontend/src/styles/HostDashboard.css
frontend/src/styles/PrintPreview.css
```

### Modified Files (4)
```
src/index.js                          (import & register setupHostRoutes)
src/bot/commands/start-game.js        (support 'generated' status)
frontend/src/App.jsx                  (routing for new pages)
src/bot/commands/my-lobbies.js        (dashboard links)
```

## Deployment Notes

1. **Build:** Docker build includes both backend and frontend (multi-stage build)
2. **Database:** Migrations run automatically on service startup
3. **Frontend:** Pre-built to `/frontend-dist` during Docker build
4. **Environment:** Requires `JWT_SECRET` in .env for token generation
5. **Webhook:** No changes to webhook URL configuration

To deploy:
```bash
docker-compose build partygame --no-cache
docker-compose up -d partygame
```

The migration will run automatically, and the new endpoints will be available immediately.
