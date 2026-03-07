# Host Dashboard Frontend — Implementation Guide

## Overview

Build a host dashboard page within the existing React frontend (same Vite app, same port). The host opens `/game?host=<lobbyId>&token=<hostToken>` and gets a full management UI for their lobby: player list, fact management, game generation, and print previews.

**Key principle**: The game generation (nickname assignment + fact distribution) now happens from the frontend via API — NOT from the Telegram `/start_game` command. The `/start_game` command only sends game links to players (it requires the game to already be generated).

---

## PART 1: Database Changes

### Migration `005_host_dashboard.sql`

Create file: `src/db/migrations/005_host_dashboard.sql`

```sql
-- New lobby status: 'generated' (between 'waiting' and 'started')
-- The 'generated' status means facts are distributed but game links haven't been sent yet.
-- No ALTER needed — status is VARCHAR(50), just use the new value in code.

-- Track which individual facts are excluded from the game by the host
CREATE TABLE IF NOT EXISTS excluded_facts (
  id SERIAL PRIMARY KEY,
  lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  fact_id INT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  excluded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lobby_id, fact_id)
);

CREATE INDEX IF NOT EXISTS idx_excluded_facts_lobby ON excluded_facts(lobby_id);

-- Store generated game URLs per participant (created during "generate", sent during "start")
ALTER TABLE lobby_participants ADD COLUMN IF NOT EXISTS game_token VARCHAR(255);
ALTER TABLE lobby_participants ADD COLUMN IF NOT EXISTS game_url TEXT;
```

**What this does:**
- `excluded_facts` — when host unchecks a fact, it goes here. The generation algorithm skips these facts.
- `game_token` / `game_url` on `lobby_participants` — generated during "Generate Game", used later when "Start Game" sends links via Telegram.
- Status flow: `waiting` → `generated` → `started` → `finished`.

---

## PART 2: Backend API Endpoints

Create file: `src/api/host.js`

All endpoints below require `hostToken` query parameter for authentication. The host token is generated when the lobby is created and stored in Redis.

### 2.1 Host Token Generation

When a lobby is created (in `src/bot/commands/create-lobby.js`), generate and store a host token:

```js
import crypto from 'crypto';
// After lobby INSERT:
const hostToken = crypto.randomBytes(16).toString('hex');
await redis.set(`lobby:${lobbyId}:hostToken`, hostToken, 86400 * 7); // 7 days
// Send to host in Telegram:
const dashboardUrl = `https://v2202504269079335176.supersrv.de/game?host=${lobbyId}&token=${hostToken}`;
// Include this URL in the lobby creation success message
```

### 2.2 Middleware: Verify Host Token

Every host API endpoint must verify the token:

```js
async function verifyHostToken(request, reply) {
  const { lobbyId } = request.params;
  const token = request.query.token || request.headers['x-host-token'];
  const cachedToken = await redis.get(`lobby:${lobbyId}:hostToken`);
  if (!cachedToken || cachedToken !== token) {
    reply.code(401);
    return reply.send({ error: 'Invalid host token' });
  }
}
```

### 2.3 Endpoints to Implement

Register all in `setupHostRoutes(app)` and call from `src/index.js`.

---

#### `GET /api/partygame/host/:lobbyId/dashboard`

Returns everything the host dashboard needs in one call.

**Response:**
```json
{
  "lobby": {
    "id": 5,
    "status": "waiting",
    "facts_per_player": 10,
    "facts_to_win": 7,
    "mode": "offline",
    "created_at": "..."
  },
  "participants": [
    {
      "user_id": 123456,
      "username": "john",
      "first_name": "John",
      "nickname": null,
      "paper_mode": true,
      "game_url": null,
      "facts": [
        { "id": 1, "content": "I once ate 50 pancakes", "excluded": false },
        { "id": 2, "content": "I can juggle", "excluded": true }
      ]
    }
  ],
  "validation": {
    "canGenerate": true,
    "errors": []
  }
}
```

**SQL logic (pseudocode):**
```sql
-- Get lobby
SELECT * FROM lobbies WHERE id = $1;

-- Get participants with paper_mode and game_url
SELECT lp.user_id, lp.nickname, lp.game_token, lp.game_url,
       u.username, u.first_name, u.paper_mode
FROM lobby_participants lp
JOIN users u ON lp.user_id = u.id
WHERE lp.lobby_id = $1
ORDER BY lp.id ASC;

-- For each participant, get their facts
SELECT f.id, f.content,
       CASE WHEN ef.id IS NOT NULL THEN true ELSE false END AS excluded
FROM facts f
LEFT JOIN excluded_facts ef ON ef.fact_id = f.id AND ef.lobby_id = $1
WHERE f.user_id = $2
ORDER BY f.created_at ASC;
```

**Validation logic** (compute `canGenerate` and `errors[]`):
1. Count participants. If < 2 → error: `"Need at least 2 players"`
2. For each participant, count non-excluded facts. If 0 → error: `"Player {name} has no active facts"`
3. Count total non-excluded facts across all participants. If < `participants.length * facts_per_player` → error: `"Not enough facts. Have {X}, need {Y} (= {N} players × {F} facts_per_player). Either add more facts or reduce facts_per_player."`
4. If status !== 'waiting' and status !== 'generated' → error: `"Game already started"`

This is the detailed feedback the host needs.

---

#### `POST /api/partygame/host/:lobbyId/toggle-fact`

Toggle a fact's exclusion from the game.

**Request body:** `{ "factId": 42 }`

**Logic:**
- If row exists in `excluded_facts` for this lobby+fact → DELETE it (re-include)
- If row doesn't exist → INSERT it (exclude)
- Return updated `{ excluded: true/false }`

**Constraint:** Only works when lobby status is `waiting`. If `generated`, host must re-generate.

---

#### `POST /api/partygame/host/:lobbyId/add-fact`

Host manually adds a fact for a player.

**Request body:** `{ "userId": 123456, "content": "Loves cats" }`

**Logic:**
1. Validate content length (5-500 chars)
2. Verify that `userId` is a participant of this lobby
3. **Do NOT enforce the 3-fact limit** — this is the host adding extra facts. Insert directly into `facts` table.
4. Return the new fact.

---

#### `POST /api/partygame/host/:lobbyId/generate`

**This is the main endpoint.** Generates the entire game: nicknames, fact distribution, game URLs.

**Logic (step by step):**

1. Verify lobby status is `waiting` or `generated` (re-generation allowed).
2. If status is `generated`, clean up previous generation:
   ```sql
   DELETE FROM game_assignments WHERE lobby_id = $1;
   UPDATE lobby_participants SET nickname = NULL, game_token = NULL, game_url = NULL, points = 0 WHERE lobby_id = $1;
   ```
3. Get all participants.
4. Get all non-excluded facts for these participants:
   ```sql
   SELECT f.id AS "factId", f.user_id AS "userId"
   FROM facts f
   WHERE f.user_id = ANY($1::bigint[])
     AND f.id NOT IN (SELECT fact_id FROM excluded_facts WHERE lobby_id = $2)
   ```
5. Run validation (same as dashboard validation). If errors → return 400 with errors array.
6. Call `generateNicknames(participants.length)` from `src/game/generator.js`.
7. Call `distributeFacts(facts, participantIds, lobby.facts_per_player)`.
8. Call `validateDistribution(...)`. If fails → return 500.
9. Generate `gameSecret` = `crypto.randomBytes(32).toString('hex')`.
10. For each participant:
    - Generate `gameToken` = `crypto.randomBytes(16).toString('hex')`
    - Build `gameUrl` = `https://v2202504269079335176.supersrv.de/game?lobby=${lobbyId}&player=${userId}&token=${gameToken}`
    - Update `lobby_participants` SET `nickname`, `game_token`, `game_url`
    - Store token in Redis: `game:${lobbyId}:${userId}:token` = gameToken (TTL 86400)
11. For each assignment: compute `answer_hash` and INSERT into `game_assignments`.
12. Update lobby: `SET status = 'generated', game_secret = $secret`. Do NOT set `started_at` yet.
13. Also cache secret in Redis: `game:${lobbyId}:secret`.

**Response:**
```json
{
  "ok": true,
  "participants": [
    { "user_id": 123, "nickname": "Весёлый Кот", "game_url": "https://..." },
    { "user_id": 456, "nickname": "Тихий Волк", "game_url": "https://..." }
  ]
}
```

---

#### `GET /api/partygame/host/:lobbyId/print`

Returns print data for all (or paper-mode-only) participants.

**Query params:** `?filter=all` or `?filter=paper`

**Logic:**
1. Lobby must be in `generated` or `started` status.
2. Get all participants (or only those with `users.paper_mode = true` if filter=paper).
3. For each participant, get their assigned facts:
   ```sql
   SELECT f.content
   FROM game_assignments ga
   JOIN facts f ON ga.fact_id = f.id
   WHERE ga.lobby_id = $1 AND ga.assigned_to_user_id = $2
   ORDER BY ga.id ASC
   ```
4. Return:
   ```json
   {
     "players": [
       {
         "nickname": "Весёлый Кот",
         "first_name": "John",
         "facts": ["fact 1 text", "fact 2 text", ...]
       }
     ]
   }
   ```

---

## PART 3: Modify Telegram `/start_game` Command

File: `src/bot/commands/start-game.js` and `src/bot/handlers/game-flow.js`

### Current behavior
`/start_game` generates nicknames, distributes facts, and sends game links — all in one step.

### New behavior
`/start_game` only works if `lobby.status === 'generated'`. It:
1. Checks status. If `waiting` → reply: `"Game not generated yet. Open the host dashboard to generate: {dashboardUrl}"`
2. If `generated`:
   - Updates status to `started`, sets `started_at = CURRENT_TIMESTAMP`
   - Reads `game_url` from `lobby_participants` for each player
   - Reads assigned facts for each player
   - Sends each player their Telegram message with nickname, facts, and game link (same format as now)
   - Does NOT re-generate anything — just sends what was already generated
3. If `started` → reply: `"Game already started."`

### Changes to `handleStartGame`:

Replace the entire body. The new logic is much simpler:

```js
export async function handleStartGame(ctx, lobbyId) {
  const db = getDb();

  // Get lobby — must be 'generated'
  const lobbyResult = await db.query('SELECT * FROM lobbies WHERE id = $1', [lobbyId]);
  const lobby = lobbyResult.rows[0];

  if (lobby.status === 'waiting') {
    const hostToken = await redis.get(`lobby:${lobbyId}:hostToken`);
    const url = `https://v2202504269079335176.supersrv.de/game?host=${lobbyId}&token=${hostToken}`;
    await ctx.reply(`⚠️ Game not generated yet.\n\nOpen the host dashboard to generate:\n${url}`);
    return;
  }

  if (lobby.status !== 'generated') {
    await ctx.reply(`❌ Game is ${lobby.status}. Cannot start.`);
    return;
  }

  // Update status
  await db.query(
    'UPDATE lobbies SET status = $1, started_at = CURRENT_TIMESTAMP WHERE id = $2',
    ['started', lobbyId]
  );

  // Get participants with pre-generated data
  const participants = await db.query(
    `SELECT lp.user_id, lp.nickname, lp.game_url
     FROM lobby_participants lp WHERE lp.lobby_id = $1`,
    [lobbyId]
  );

  let notifiedCount = 0;
  for (const p of participants.rows) {
    // Get this player's assigned facts
    const factsResult = await db.query(
      `SELECT f.content FROM game_assignments ga
       JOIN facts f ON ga.fact_id = f.id
       WHERE ga.lobby_id = $1 AND ga.assigned_to_user_id = $2
       ORDER BY ga.id ASC`,
      [lobbyId, p.user_id]
    );

    let message = `🎮 Game #${lobbyId} started!\n\nYour nickname: ${p.nickname}\n\nFacts to guess:\n`;
    factsResult.rows.forEach((f, i) => { message += `${i + 1}. ${f.content}\n`; });
    message += `\n🔗 Play: ${p.game_url}`;

    try {
      await ctx.telegram.sendMessage(p.user_id, message);
      notifiedCount++;
    } catch (err) {
      console.error(`Failed to notify ${p.user_id}: ${err.message}`);
    }
  }

  await ctx.reply(`✅ Game started! Notified ${notifiedCount}/${participants.rows.length} players.`);
}
```

### Changes to `create-lobby.js`

After inserting the lobby, generate a host token and include the dashboard URL in the success message:

```js
const hostToken = crypto.randomBytes(16).toString('hex');
await redis.set(`lobby:${lobbyId}:hostToken`, hostToken, 86400 * 7);
const dashboardUrl = `https://v2202504269079335176.supersrv.de/game?host=${lobbyId}&token=${hostToken}`;

await ctx.reply(
  `✅ Lobby #${lobbyId} created!\n\n` +
  `🔗 Host dashboard: ${dashboardUrl}\n\n` +
  `Players join with: /join_lobby ${lobbyId}` +
  (password ? ` ${password}` : '')
);
```

---

## PART 4: Frontend — Routing

File: `frontend/src/App.jsx`

The App component currently reads `lobby`, `player`, `token` from URL params. Add detection for the host dashboard mode:

```jsx
export default function App() {
  const [mode, setMode] = useState(null); // 'player' | 'host' | 'print'
  const [gameState, setGameState] = useState(null);
  const [hostState, setHostState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Print preview mode: /game?print=<lobbyId>&token=<hostToken>&filter=all|paper
    if (params.get('print')) {
      setMode('print');
      loadPrintData(params.get('print'), params.get('token'), params.get('filter') || 'all');
      return;
    }

    // Host dashboard mode: /game?host=<lobbyId>&token=<hostToken>
    if (params.get('host')) {
      setMode('host');
      loadHostDashboard(params.get('host'), params.get('token'));
      return;
    }

    // Player game mode (existing): /game?lobby=<id>&player=<id>&token=<token>
    const lobbyId = params.get('lobby');
    const playerId = params.get('player');
    const token = params.get('token');
    if (lobbyId && playerId && token) {
      setMode('player');
      loadGameData(lobbyId, playerId, token);
      return;
    }

    setError('Missing game parameters. Invalid link.');
    setLoading(false);
  }, []);

  // ... loadGameData stays the same ...

  async function loadHostDashboard(lobbyId, token) {
    try {
      const res = await fetch(`/api/partygame/host/${lobbyId}/dashboard?token=${token}`);
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data = await res.json();
      setHostState({ lobbyId, token, ...data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPrintData(lobbyId, token, filter) {
    try {
      const res = await fetch(`/api/partygame/host/${lobbyId}/print?token=${token}&filter=${filter}`);
      if (!res.ok) throw new Error('Failed to load print data');
      const data = await res.json();
      setHostState({ lobbyId, token, filter, ...data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} />;
  if (mode === 'host') return <HostDashboard state={hostState} onRefresh={() => loadHostDashboard(hostState.lobbyId, hostState.token)} />;
  if (mode === 'print') return <PrintPreview state={hostState} />;
  if (mode === 'player') return <GameScreen state={gameState} onChange={setGameState} />;
  return <ErrorScreen error="Unknown mode" />;
}
```

---

## PART 5: Frontend — HostDashboard Component

Create file: `frontend/src/components/HostDashboard.jsx`

### Layout Description

A single-page dashboard with these sections from top to bottom:

#### Header
- Title: `"Host Dashboard — Lobby #{id}"`
- Status badge: colored chip showing lobby status (`waiting` / `generated` / `started`)
- Settings summary: `"Facts per player: 10 | Facts to win: 7 | Mode: offline"`

#### Validation Banner
- If `validation.errors` is non-empty: show a red/orange banner with all error messages as a bullet list.
- If `validation.canGenerate` is true: show a green "Ready to generate" indicator.

#### Players Section
For each participant, render a card:

```
┌─────────────────────────────────────────────────┐
│ John (@john_doe)             🖨️ Paper: ON       │
│ Nickname: Весёлый Кот  (only shown after gen)   │
│ Game URL: https://...  (only shown after gen)   │
│                                                 │
│ Facts:                                          │
│  ☑ "I once ate 50 pancakes"                     │
│  ☐ "I can juggle" (strikethrough — excluded)    │
│  ☑ "I love my cat"                              │
│                                                 │
│ Add fact: [___________________________] [Add]   │
└─────────────────────────────────────────────────┘
```

- Each fact has a checkbox (toggle). Checked = included (default). Unchecked = excluded.
- Clicking the checkbox calls `POST /api/partygame/host/:lobbyId/toggle-fact`.
- Excluded facts are shown with strikethrough text and dimmed color.
- "Add fact" input + button at the bottom of each player card. Calls `POST /api/partygame/host/:lobbyId/add-fact`.
- Paper mode indicator is read-only (set by the player via `/paper` in Telegram).

#### Action Buttons (sticky bottom bar or prominent section)

```
[ 🎲 Generate Game ]   [ ▶️ Start Game ]   [ 🖨 Print All ]   [ 🖨 Print Paper ]
```

- **Generate Game**: enabled when `validation.canGenerate === true` and status is `waiting` or `generated`. Calls `POST /api/partygame/host/:lobbyId/generate`. On success, refresh dashboard. Show loading spinner during generation.
- **Start Game**: enabled only when status is `generated`. Calls `POST /api/partygame/host/:lobbyId/start-via-api` (see section 2.3 addendum below). On success, show confirmation.
- **Print All**: opens new tab: `/game?print={lobbyId}&token={hostToken}&filter=all`
- **Print Paper**: opens new tab: `/game?print={lobbyId}&token={hostToken}&filter=paper`

### API call for "Start Game" button (addendum)

Add one more backend endpoint:

#### `POST /api/partygame/host/:lobbyId/start-via-api`

This does the same thing as the Telegram `/start_game` command but triggered from the web UI. It:
1. Verifies host token.
2. Verifies status is `generated`.
3. Updates status to `started`, sets `started_at`.
4. Sends Telegram messages to all participants (nickname + facts + game_url).
5. Returns `{ ok: true, notified: 5, total: 6 }`.

You need access to the Telegram bot instance. Import it or pass it during route setup:
```js
// In src/index.js, when registering:
await setupHostRoutes(app, bot);
```

### State Management

The dashboard should poll or re-fetch after every action. Simplest approach:
- After every POST action (toggle fact, add fact, generate, start), call `onRefresh()` which re-fetches `GET /dashboard`.
- No need for WebSockets.

### Styling
- Use TailwindCSS (already set up).
- Dark theme to match the existing game UI: `bg-gradient-to-br from-gray-900 to-gray-800`.
- Cards: `bg-white/10 border border-white/10 rounded-xl`.
- Buttons: similar to existing yellow primary buttons.

---

## PART 6: Frontend — PrintPreview Component

Create file: `frontend/src/components/PrintPreview.jsx`

This is a **separate page** (opened in a new tab). It shows all questionnaires in a print-friendly black-and-white layout.

### Layout

```
┌──────────────────────── A4 Page ─────────────────────────┐
│                                                          │
│                    ВЕСЁЛЫЙ КОТ                           │
│              ──────────────────────                      │
│                                                          │
│  1. «I once ate 50 pancakes»     ____________________   │
│  2. «I can juggle»               ____________________   │
│  3. «I love cats»                ____________________   │
│  ...                                                     │
│  10. «Some fact»                 ____________________   │
│                                                          │
│                                       party game         │
│                                                          │
└──────────────────────────────────────────────────────────┘
│                    PAGE BREAK                            │
┌──────────────────────── A4 Page ─────────────────────────┐
│                                                          │
│                    ТИХИЙ ВОЛК                            │
│                                                          │
│  ...                                                     │
```

### Rules

- **One player per page.** Use CSS `page-break-after: always` between players.
- **Nickname in large bold caps** at the top of each page. This is the player's assigned game nickname (NOT their real name).
- Up to 10 facts per page fit comfortably. If a player has more than 10 facts, allow overflow to a second page (very rare scenario).
- **Black and white only.** No colors, no gradients. Font: Georgia/serif.
- Underline blanks for handwritten answers.
- Small footer: "party game".

### Print Button

At the top of the page (outside the printable area), show:
- A header: "Print Preview — {N} questionnaires"
- A **"Print" button** that calls `window.print()`
- A "Back to dashboard" link

Use `@media print` to hide the header/button and show only the questionnaires.

### CSS Structure

```css
@media screen {
  .print-controls { display: block; }
  .print-page { border: 1px solid #ccc; margin: 20px auto; padding: 10mm; max-width: 210mm; min-height: 297mm; }
}

@media print {
  .print-controls { display: none !important; }
  .print-page { border: none; margin: 0; padding: 10mm 12mm; }
  .print-page + .print-page { page-break-before: always; }
  @page { margin: 0; size: A4 portrait; }
}
```

---

## PART 7: Register New Routes in index.js

File: `src/index.js`

```js
import { setupHostRoutes } from './api/host.js';

// After other route registrations:
await setupHostRoutes(app, bot);
```

---

## PART 8: Summary of All Files to Create/Modify

### New files:
| File | What |
|------|------|
| `src/db/migrations/005_host_dashboard.sql` | New table + columns |
| `src/api/host.js` | All host API endpoints |
| `frontend/src/components/HostDashboard.jsx` | Dashboard UI |
| `frontend/src/components/PrintPreview.jsx` | Print preview page |

### Modified files:
| File | What changes |
|------|-------------|
| `src/index.js` | Import and register `setupHostRoutes(app, bot)` |
| `src/bot/commands/create-lobby.js` | Generate hostToken, include dashboard URL in reply |
| `src/bot/commands/start-game.js` | No changes needed (it calls handleStartGame) |
| `src/bot/handlers/game-flow.js` | Rewrite `handleStartGame` — only sends messages, no generation |
| `frontend/src/App.jsx` | Add host/print mode detection and routing |

### Files that do NOT change:
- `src/game/generator.js` — reuse as-is
- `src/api/game.js` — player game endpoints unchanged
- `src/api/facts.js` — player fact endpoints unchanged
- `src/api/lobbies.js` — existing endpoints unchanged (the `/lobbies/:id/start` endpoint is now superseded by the host endpoint but can remain for backwards compat)
- All other bot commands — unchanged
- Database tables `users`, `facts`, `lobbies`, `lobby_participants`, `game_assignments`, `guesses` — no schema changes (only new columns on `lobby_participants` and new `excluded_facts` table)

---

## PART 9: Implementation Order

Follow this exact order to avoid breaking anything:

1. **Migration** — Create and run `005_host_dashboard.sql`
2. **Backend `src/api/host.js`** — Implement all 5 endpoints (dashboard, toggle-fact, add-fact, generate, start-via-api, print). Write and test each one.
3. **Modify `src/index.js`** — Register host routes.
4. **Modify `create-lobby.js`** — Add hostToken generation + dashboard URL.
5. **Modify `game-flow.js`** — Rewrite handleStartGame for the new flow.
6. **Frontend `PrintPreview.jsx`** — Build the print preview component (simpler, no interactivity).
7. **Frontend `HostDashboard.jsx`** — Build the full dashboard with all actions.
8. **Frontend `App.jsx`** — Add routing logic for host/print modes.
9. **Test the full flow**: create lobby → open dashboard → add facts → toggle facts → generate → verify game URLs → print preview → start game → verify Telegram messages arrive → verify players can open game links.

---

## PART 10: Edge Cases & Gotchas

1. **Re-generation**: Host can click "Generate" multiple times while in `waiting` or `generated` status. Each time, wipe previous `game_assignments` and re-generate everything. Old game tokens in Redis will be overwritten.

2. **Facts limit**: The 3-fact limit is enforced for players adding their own facts via Telegram. The host's "Add fact" bypasses this limit. Do NOT add the 3-fact check in the host add-fact endpoint.

3. **Excluded facts scope**: Exclusions are per-lobby. The same fact can be excluded in one lobby but included in another (if a player is in multiple lobbies). The `excluded_facts` table has `(lobby_id, fact_id)` unique constraint.

4. **Token in URL**: The hostToken goes in the URL query string. This is acceptable because:
   - It's a single-use management link
   - It's sent privately via Telegram DM
   - Same pattern as player game tokens

5. **Status transitions**: Strictly enforce: `waiting` → `generated` → `started` → `finished`. Never skip. The generate endpoint allows `waiting` → `generated` and `generated` → `generated` (re-gen). The start endpoint only allows `generated` → `started`.

6. **Bot instance in API**: The `start-via-api` endpoint needs to send Telegram messages. Pass the `bot` instance to `setupHostRoutes(app, bot)` and use `bot.telegram.sendMessage(userId, message)`.

7. **Paper mode is read-only on dashboard**: The host can SEE who has paper mode ON but cannot toggle it. Only the player can toggle it via `/paper` in Telegram.

8. **Print preview page loads independently**: It's a separate page opened via `window.open()`. It fetches its own data from `/api/partygame/host/:lobbyId/print`. It does not share state with the dashboard.

9. **No WebSocket needed**: Simple fetch-after-action pattern. The dashboard is used by one person (the host), so polling/real-time is unnecessary.

10. **The existing `POST /api/partygame/lobbies/:id/start` endpoint** in `src/api/lobbies.js` is now legacy. You can either remove it or leave it (it won't break anything since the Telegram command no longer calls it). Recommended: leave it but add a check — if status is not `waiting`, return 400. This prevents accidental double-generation from old code paths.
