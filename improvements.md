# Party Game — Code Review & Improvement Plan

> **Author:** Tech Lead
> **Audience:** Junior developer + Product manager
> **Date:** 2025-03-05
> **Purpose:** Step-by-step plan to fix bugs, improve UX, and add tests

---

## Table of Contents

1. [Bugs Found](#1-bugs-found)
2. [Fixes — Direction Only](#2-fixes--direction-only)
3. [Required Changes — Detailed](#3-required-changes--detailed)
4. [Autotest Plan](#4-autotest-plan)
5. [Implementation Order](#5-implementation-order)

---

## 1. Bugs Found

### BUG-1: Online mode guess checks wrong field (CRITICAL)

**File:** `src/api/game.js`, lines 184–206
**What happens:** In the online guess endpoint (`POST /lobbies/:lobbyId/guess`), the code fetches `assigned_to_user_id` from `game_assignments` and then gets that user's nickname. But `assigned_to_user_id` is the player who *received* the fact — not the author. It should look up `from_user_id` to find who *wrote* the fact.
**Impact:** Every online mode guess is compared against the wrong nickname. Correct answers register as wrong and vice versa.
**PM note:** Online mode is completely broken. No player can win an online game because the answer key is wrong.

### BUG-2: Duplicate nickname in adjective list

**File:** `src/game/generator.js`, line 3 vs line 9
**What happens:** "Веселый" (line 3) and "Весёлый" (line 9) are the same word with different `е`/`ё` characters. While technically distinct strings, they are pronounced identically and a player cannot tell them apart.
**Impact:** Two players could get nicknames like "Веселый Кот" and "Весёлый Лиса" — players will confuse them.
**PM note:** Players will make mistakes because they can't tell two nicknames apart by looking at them.

### BUG-3: `distributeFacts` has type mismatch on userId comparison

**File:** `src/game/generator.js`, line 93
**What happens:** `targetUserId` comes from `participantUserIds` (may be Number), while `fact.userId` comes from a SQL query aliased as `"userId"` (returns as string from PostgreSQL bigint). The `===` strict comparison `targetUserId === fact.userId` can fail even when values are logically equal.
**Impact:** A player could receive their own fact, which breaks the core game mechanic.
**PM note:** Players might see their own fact and have to guess themselves — ruins the game.

### BUG-4: `from_user_id` not saved in API lobby start route

**File:** `src/api/lobbies.js`, line 153
**What happens:** The SQL INSERT for `game_assignments` omits the `from_user_id` column. The bot handler (`game-flow.js`, line 93) saves it correctly, but the REST API route does not.
**Impact:** If the game is started via the API endpoint instead of the Telegram bot, `from_user_id` is NULL. The offline validation endpoint (`game.js` line 110–116) joins on `from_user_id` and would return 0 rows — every guess returns "Fact assignment not found".
**PM note:** Starting a game from the API (web) is broken — no player can validate any answer.

### BUG-5: Answer hash uses wrong nickname in API lobby start route

**File:** `src/api/lobbies.js`, line 146
**What happens:** `nicknames[participants.indexOf(assignment.assignedToUserId)]` — this hashes using the nickname of the player who *receives* the fact, not the *author*. The bot handler (`game-flow.js`, line 83–84) correctly uses `fromUserId` to find the author's nickname.
**Impact:** The SHA256 answer hash is computed with the wrong nickname. Offline validation will never match.
**PM note:** Same as BUG-4 — the web API path is doubly broken for offline mode.

### BUG-6: `gameSecret` not stored in DB via bot handler

**File:** `src/bot/handlers/game-flow.js`, line 79–80
**What happens:** The game secret is stored only in Redis (with 24h TTL) but not written to the `lobbies.game_secret` column. The API route (`lobbies.js` line 161) correctly saves it to both.
**Impact:** If Redis evicts the key or restarts, offline validation breaks permanently because the secret is lost.
**PM note:** Games started via Telegram could break after ~24 hours or a server restart.

### BUG-7: `start_game` bot command sends double success message

**File:** `src/bot/commands/start-game.js`, line 56
**What happens:** After calling `handleStartGame(ctx, lobbyId)` — which already sends `ctx.reply("Game started! Notified X/Y players.")` — the command sends a second `ctx.reply("Game #X started!")`.
**Impact:** Host sees two "game started" messages. Confusing but not a data bug.
**PM note:** Minor UX annoyance, host sees duplicate messages.

### BUG-8: ScoreBoard always shows "Points: 0"

**File:** `frontend/src/components/ScoreBoard.jsx`, line 10
**What happens:** The component hardcodes `Points: 0` instead of using actual participant data. No score data is fetched or tracked on the frontend.
**Impact:** Players never see their real scores or other players' scores.
**PM note:** The scoreboard is decorative — it shows zero for everyone, always.

### BUG-9: Lobby password exposed in `lobby_status` to all users

**File:** `src/bot/commands/lobby-status.js`, line 38
**What happens:** The password is shown to every user who calls `/lobby_status`, not just the host.
**Impact:** Any player can see the lobby password, making password protection pointless.
**PM note:** Security issue — passwords are visible to everyone.

### BUG-10: No user registration check before lobby create/join

**File:** `src/bot/commands/create-lobby.js`, `join-lobby.js`
**What happens:** When a user creates or joins a lobby, there's no check that they exist in the `users` table. If a new user calls `/create_lobby` before sending `/start`, the `host_id` FK may reference a non-existent user.
**Impact:** Could cause FK constraint errors or orphaned records.
**PM note:** A brand new user who skips `/start` and goes straight to creating a lobby will hit an error.

### BUG-11: `cancel_lobby` deletes lobby but not child records

**File:** `src/bot/commands/cancel-lobby.js`, line 39
**What happens:** `DELETE FROM lobbies WHERE id = $1` — if there are no CASCADE constraints, `lobby_participants` and `game_assignments` rows referencing this lobby become orphaned.
**Impact:** Database pollution; orphaned rows accumulate over time.
**PM note:** Not user-visible immediately, but causes data integrity issues long-term.

### BUG-12: Token generated with `Math.random()` — weak security

**File:** `src/bot/handlers/game-flow.js`, lines 132–135
**What happens:** Game tokens and game secrets use `Math.random()` which is not cryptographically secure. The API route (`lobbies.js` line 106) correctly uses `crypto.randomBytes()`.
**Impact:** Tokens are predictable. An attacker could guess another player's game URL.
**PM note:** Security risk — someone could potentially access another player's game.

### BUG-13: Facts API `DELETE` has no authorization

**File:** `src/api/facts.js`, lines 64–84
**What happens:** `DELETE /api/partygame/facts/:factId` deletes any fact by ID with no check on who owns it. Any API caller can delete anyone's facts.
**Impact:** Any user can delete any other user's facts via the API.
**PM note:** Security issue — anyone can sabotage other players' facts.

### BUG-14: Redis `get` returns parsed JSON, but token comparison expects string

**File:** `src/api/game.js`, line 15 + `src/redis/index.js`, line 36
**What happens:** `redis.set()` calls `JSON.stringify(value)` on the token string, turning `"abc123"` into `'"abc123"'`. Then `redis.get()` calls `JSON.parse()`, returning `"abc123"`. In this case it happens to round-trip correctly for plain strings. However, if the token ever contains characters special to JSON (unlikely but fragile), this breaks.
**Impact:** Low — works currently, but the pattern is fragile and should be noted.

---

## 2. Fixes — Direction Only

| Bug | Fix Direction |
|-----|--------------|
| BUG-1 | In the online guess endpoint, change the query to look up `from_user_id` instead of `assigned_to_user_id`, then fetch the nickname of the fact *author*. |
| BUG-2 | Remove the duplicate "Весёлый" (with ё) from the adjectives array — keep only "Веселый". |
| BUG-3 | Normalize both sides to `Number()` before comparing. Either cast `fact.userId` to Number or use `==` instead of `===`. The cleaner fix is `Number(targetUserId) === Number(fact.userId)`. |
| BUG-4 | Add `from_user_id` to the INSERT statement in the API route, using `assignment.fromUserId`. |
| BUG-5 | Change the nickname lookup to use `participants.indexOf(assignment.fromUserId)` instead of `assignment.assignedToUserId`. |
| BUG-6 | After generating the secret in the bot handler, also write it to the `lobbies.game_secret` column via an UPDATE query. |
| BUG-7 | Remove the second `ctx.reply()` in `start-game.js` since `handleStartGame` already sends a confirmation. |
| BUG-8 | Track scores in frontend state; update on correct guess; pass real data to ScoreBoard. (More detail in Section 3.) |
| BUG-9 | Only show the password to the host. For other users, show "yes" or "no" instead of the actual value. |
| BUG-10 | Add a "user ensured" step: before create/join, check if user exists in `users` table; if not, INSERT them (upsert). |
| BUG-11 | Either add `ON DELETE CASCADE` to the FK constraints in a migration, or explicitly delete `lobby_participants` and `game_assignments` before deleting the lobby. |
| BUG-12 | Replace `Math.random()` calls with `crypto.randomBytes()` for both token and secret generation. |
| BUG-13 | Add a `user_id` check to the DELETE query: `DELETE FROM facts WHERE id = $1 AND user_id = $2`. Require `userId` in the request body or headers. |
| BUG-14 | No immediate action required. Consider adding a raw string get/set to the Redis wrapper for non-JSON values like tokens. |

---

## 3. Required Changes — Detailed

### 3.1 Check before a player creates a lobby or joins it

**Problem:** A new Telegram user who hasn't sent `/start` has no row in the `users` table. Creating or joining a lobby references their user ID, which may not exist in `users`.

**What to do:**

1. Create a shared helper function `ensureUser(ctx)` in a new file `src/bot/helpers/ensure-user.js`:
   - Takes the Telegraf context
   - Extracts `ctx.from.id`, `ctx.from.username`, `ctx.from.first_name`
   - Does an `INSERT INTO users ... ON CONFLICT (id) DO UPDATE SET username = ..., first_name = ...`
   - This is an "upsert" — creates if missing, updates if exists

2. Call `ensureUser(ctx)` at the top of:
   - `createLobbyCommand`
   - `joinLobbyCommand`
   - `handleFactInput`

**PM note:** This guarantees that any player interacting with the bot always has a valid user record. No more crashes for new users.

### 3.2 Frontend should be independent in offline mode

**Problem:** Currently the offline frontend calls the backend for every guess validation (`POST /validate`). The whole point of offline mode is that the frontend should work without a server after initial load.

**What to do:**

1. The backend already sends `answerHash` for each fact in the game data response. The game secret is the missing piece.
2. In `game-flow.js`, include the `gameSecret` in the game data URL or send it alongside the game payload.
3. In the frontend `GameScreen.jsx`:
   - Import a SHA256 library (already in `frontend/package.json`: `crypto-js`)
   - On guess: compute `SHA256(factId + guessedNickname + gameSecret)` locally
   - Compare against the `answerHash` from game data
   - If match → correct. No API call needed.
   - Track score locally in component state
4. Remove the `/validate` API call from the offline game flow entirely.
5. Keep the `/validate` endpoint alive for backward compatibility but mark it as deprecated.

**PM note:** After this change, once a player opens the game link, they can play the entire game without internet. This is critical for party settings where WiFi may be unreliable.

### 3.3 Usability improvements for Telegram commands

**Problem:** The current command UX is clunky — users must type lobby IDs manually, remember command syntax, etc.

**What to do:**

1. **Inline keyboard buttons** — After creating a lobby, send inline buttons instead of text commands:
   - [Start Game] [Edit Settings] [Cancel Lobby]
   - When clicked, these trigger callback queries that call the same logic

2. **Lobby status buttons** — In `/lobby_status`, add buttons:
   - For host: [Start Game] [End Game] [Cancel]
   - For player: [Leave Lobby]

3. **Simplify `/join_lobby`** — Accept lobby link or just a number. If the lobby has a password, ask for it in a follow-up message instead of requiring it in the same command.

4. **Add `/leave_lobby <id>`** — Currently there's no way for a non-host player to leave a lobby.

5. **Fact input confirmation** — When a user sends a fact, add inline buttons [Keep] [Delete] so they can undo immediately.

6. **Command menu** — Register bot commands with Telegram via `bot.telegram.setMyCommands()` so users see a menu of available commands when they type `/`.

**PM note:** These changes make the bot feel like a modern Telegram bot with clickable buttons instead of requiring users to type complex commands from memory.

### 3.4 Player should type nicknames, not pick from a list

**Problem:** The frontend currently shows a list of nickname buttons. The player just clicks one. The whole point of the game is that you need to *know* who the other players are by their nicknames — picking from a list is too easy.

**What to do:**

1. **Replace `NicknameSelector` component** with a text input form:
   - A text `<input>` field where the player types a nickname
   - An autocomplete/suggestion list that appears as they type (optional — may make it too easy)
   - A "Submit" button

2. **Matching logic:**
   - Trim whitespace, compare case-insensitively
   - Consider fuzzy matching for minor typos (e.g., Levenshtein distance ≤ 2) — but only for UX, still require exact match for the hash validation
   - Show a "Did you mean...?" prompt if the typed name is close but not exact

3. **Keep the participant list visible** elsewhere on the screen (e.g., a collapsible sidebar or a "Players" button that opens a modal) so players can reference who's playing, but NOT see which nicknames are available for each fact.

**PM note:** This is a core game design change. The fun comes from knowing which of your friends wrote a fact based on what you know about them. A dropdown list removes that challenge entirely. The text input preserves the "aha moment" when you recognize a friend's fact.

### 3.5 Offline mode: player can't see others' scores

**Problem:** In offline mode, each player plays independently on their own device. There's no mechanism to see other players' scores. The ScoreBoard component shows hardcoded zeros.

**What to do:**

1. **Remove ScoreBoard from offline mode entirely** — it's misleading to show scores that are always zero.

2. **Show only personal progress:**
   - "You: X/Y correct"
   - Progress bar of how many facts you've guessed
   - A percentage accuracy indicator

3. **End-of-game summary via Telegram:**
   - When a player finishes all facts (or reaches `factsToWin`), the frontend shows their personal result
   - Optionally, send results back to the bot (a single POST with final score) so the host can see all scores via `/lobby_status` or `/end_game`

4. **For online mode** (future): implement a WebSocket or polling mechanism to update the ScoreBoard in real time.

**PM note:** In offline mode, it's simply not possible to show live scores of other players. Instead of showing fake zeros, we show the player their own progress clearly and let the host aggregate results via Telegram.

---

## 4. Autotest Plan

These tests should pass before the code is considered "ready". Organized by priority.

### 4.1 Unit Tests (run with: `npm test`)

#### Generator tests (`src/game/__tests__/generator.test.js`)
- **test_generateNicknames_returns_correct_count** — Call `generateNicknames(5)`, assert result has length 5
- **test_generateNicknames_all_unique** — Call `generateNicknames(20)`, assert no duplicates in result
- **test_generateNicknames_throws_when_too_many** — Call `generateNicknames(3000)`, assert it throws
- **test_distributeFacts_no_self_facts** — Create facts for 4 users, distribute, assert no assignment has `assignedToUserId === fromUserId`
- **test_distributeFacts_correct_count_per_player** — Assert each player gets exactly `factsPerPlayer` facts
- **test_distributeFacts_no_duplicate_source_per_player** — Assert no player gets two facts from the same author
- **test_distributeFacts_throws_when_insufficient_facts** — Assert error when total facts < players * factsPerPlayer
- **test_distributeFacts_type_coercion** — Pass userId as string from SQL vs Number in participantIds, assert the "no self-facts" rule still works (this tests BUG-3 fix)
- **test_validateDistribution_catches_own_facts** — Pass an assignment where from === assigned, assert returns false

#### Frontend validation tests (`frontend/src/__tests__/offline-validation.test.js`)
- **test_local_hash_matches_server_hash** — Given same factId, nickname, and secret, assert SHA256 output matches
- **test_incorrect_guess_does_not_match** — Given wrong nickname, assert hash does not match
- **test_score_increments_on_correct** — Simulate correct guess, assert score state increases by 1
- **test_game_won_at_threshold** — Simulate reaching `factsToWin`, assert gameWon state is true

### 4.2 Integration Tests (run with: `npm run test:integration`)

#### Lobby lifecycle tests
- **test_create_lobby_inserts_db_record** — Call create, assert lobby exists in DB with status "waiting"
- **test_join_lobby_requires_facts** — Try to join with 0 facts, assert rejection
- **test_join_lobby_with_password** — Create lobby with password, join with wrong password (fail), join with correct (success)
- **test_join_lobby_prevents_double_join** — Join twice, assert second attempt returns "already in"
- **test_user_ensured_on_create** — New user creates lobby, assert user record exists in `users` table
- **test_user_ensured_on_join** — New user joins lobby, assert user record exists in `users` table
- **test_cancel_lobby_deletes_children** — Cancel lobby, assert no orphaned `lobby_participants` or `game_assignments` rows

#### Game flow tests
- **test_start_game_assigns_nicknames** — Start a game, assert all participants have nicknames
- **test_start_game_creates_assignments** — Assert `game_assignments` rows match expected count
- **test_start_game_saves_game_secret_to_db** — Assert `lobbies.game_secret` is not null after start
- **test_online_guess_correct** — Submit correct nickname for a fact, assert `isCorrect: true` and points increase
- **test_online_guess_checks_author_not_receiver** — This tests BUG-1 fix: assert the correct answer is the *author's* nickname
- **test_offline_validate_correct** — Submit correct hash, assert `isCorrect: true`
- **test_game_ends_on_win** — Submit enough correct guesses to win, assert lobby status becomes "finished"

### 4.3 API Security Tests

- **test_delete_fact_requires_ownership** — Try to delete another user's fact, assert 403
- **test_game_token_required** — Access game data without token, assert 401
- **test_lobby_password_hidden_for_non_host** — Call `/lobby_status` as non-host, assert password is not visible
- **test_api_guess_no_replay** — Submit same guess twice, assert second is rejected (prevents score inflation)

### 4.4 End-to-End Test (run manually or with: `npm run test:e2e`)

- **test_full_game_flow** — Create lobby → 3 players join → add facts → start game → each player guesses → one player wins → game ends
- **test_offline_full_flow** — Same as above but in offline mode, validating locally without API calls

---

## 5. Implementation Order

> Each step should be a separate branch/PR. Do not combine unrelated changes.

### Phase 1: Critical Bug Fixes (do first — the game is broken without these)

| Step | What | Files | Estimated Effort | Why First |
|------|------|-------|-----------------|-----------|
| 1.1 | **Fix BUG-1:** Online guess checks wrong user | `src/api/game.js` | Small | Online mode is 100% broken |
| 1.2 | **Fix BUG-3:** Type coercion in distributeFacts | `src/game/generator.js` | Small | Players can get their own facts |
| 1.3 | **Fix BUG-4 + BUG-5:** API route missing from_user_id + wrong hash | `src/api/lobbies.js` | Small | API game start is broken |
| 1.4 | **Fix BUG-6:** Save game_secret to DB in bot handler | `src/bot/handlers/game-flow.js` | Small | Games break after Redis eviction |
| 1.5 | **Write unit tests for generator** | `src/game/__tests__/generator.test.js` | Medium | Validate fixes 1.2–1.3 |
| 1.6 | **Write integration tests for game flow** | `tests/integration/game-flow.test.js` | Medium | Validate fixes 1.1, 1.3–1.4 |

### Phase 2: Security Fixes

| Step | What | Files | Estimated Effort | Why |
|------|------|-------|-----------------|-----|
| 2.1 | **Fix BUG-9:** Hide password from non-hosts | `src/bot/commands/lobby-status.js` | Small | Password protection is meaningless without this |
| 2.2 | **Fix BUG-12:** Use crypto.randomBytes for tokens | `src/bot/handlers/game-flow.js` | Small | Predictable tokens = security hole |
| 2.3 | **Fix BUG-13:** Add ownership check to fact deletion API | `src/api/facts.js` | Small | Anyone can delete anyone's facts |
| 2.4 | **Write security tests** | `tests/security/` | Medium | Validate fixes 2.1–2.3 |

### Phase 3: Data Integrity Fixes

| Step | What | Files | Estimated Effort | Why |
|------|------|-------|-----------------|-----|
| 3.1 | **Fix BUG-10:** Add ensureUser helper | `src/bot/helpers/ensure-user.js`, `create-lobby.js`, `join-lobby.js`, `fact-input.js` | Medium | New users crash on lobby actions |
| 3.2 | **Fix BUG-11:** Cascade delete for lobby children | New migration + `cancel-lobby.js` | Small | Orphaned records pollute DB |
| 3.3 | **Fix BUG-2:** Remove duplicate adjective | `src/game/generator.js` | Tiny | Confusing nicknames |
| 3.4 | **Fix BUG-7:** Remove duplicate start message | `src/bot/commands/start-game.js` | Tiny | UX annoyance |
| 3.5 | **Write integration tests for lobby lifecycle** | `tests/integration/lobby.test.js` | Medium | Validate fixes 3.1–3.2 |

### Phase 4: Frontend — Offline Independence

| Step | What | Files | Estimated Effort | Why |
|------|------|-------|-----------------|-----|
| 4.1 | **Include game_secret in game data response** | `src/api/game.js`, `src/bot/handlers/game-flow.js` | Small | Frontend needs the secret for local validation |
| 4.2 | **Implement local SHA256 validation in frontend** | `frontend/src/components/GameScreen.jsx` | Medium | Core offline functionality |
| 4.3 | **Remove ScoreBoard in offline mode, show personal progress** | `frontend/src/components/ScoreBoard.jsx`, `GameScreen.jsx` | Medium | Fix BUG-8 and the "always zero" problem |
| 4.4 | **Write frontend validation tests** | `frontend/src/__tests__/offline-validation.test.js` | Medium | Validate the local hash comparison works |
| 4.5 | **Optional: send final score back to bot** | New API endpoint + frontend | Medium | So hosts can see results |

### Phase 5: UX — Text Input Instead of Button List

| Step | What | Files | Estimated Effort | Why |
|------|------|-------|-----------------|-----|
| 5.1 | **Replace NicknameSelector with text input form** | `frontend/src/components/NicknameSelector.jsx` | Medium | Core game mechanic change |
| 5.2 | **Add case-insensitive matching + trim** | Same file | Small | Usability |
| 5.3 | **Add "Players" reference modal/sidebar** | New component `PlayerList.jsx` + `GameScreen.jsx` | Medium | Players need to see who's playing |
| 5.4 | **Write tests for input matching** | Frontend tests | Small | Validate fuzzy/exact matching |

### Phase 6: Telegram UX Improvements

| Step | What | Files | Estimated Effort | Why |
|------|------|-------|-----------------|-----|
| 6.1 | **Register bot commands with setMyCommands** | `src/bot/index.js` | Small | Users see command menu |
| 6.2 | **Add inline keyboard buttons to lobby creation** | `src/bot/commands/create-lobby.js` | Medium | Clickable instead of typing |
| 6.3 | **Add inline keyboard buttons to lobby_status** | `src/bot/commands/lobby-status.js` | Medium | Quick host actions |
| 6.4 | **Add `/leave_lobby` command** | New file `src/bot/commands/leave-lobby.js` + register in `bot/index.js` | Medium | Players can't leave lobbies currently |
| 6.5 | **Split `/join_lobby` password into follow-up** | `src/bot/commands/join-lobby.js` | Medium | Better UX for password entry |
| 6.6 | **Add callback handler for inline buttons** | `src/bot/handlers/callback-handler.js` | Large | Wires up all inline button actions |

### Phase 7: Final Validation

| Step | What | Estimated Effort |
|------|------|-----------------|
| 7.1 | **Run full unit test suite** | — |
| 7.2 | **Run full integration test suite** | — |
| 7.3 | **Run security tests** | — |
| 7.4 | **Manual E2E test: full game with 3+ players** | 1 hour |
| 7.5 | **Manual E2E test: offline mode on mobile** | 30 min |

---

## Summary for Product Manager

**Current state:** The game has 14 bugs. Two are critical (online mode doesn't work at all, players can get their own facts). Three are security issues (exposed passwords, predictable tokens, unauthorized deletion). The frontend scoreboard is non-functional.

**After Phase 1–3:** The game works correctly in both modes. Security holes are closed. Data integrity is maintained.

**After Phase 4–5:** The offline mode is truly offline. The game mechanic changes from "pick from list" to "type what you think" — which is the intended gameplay.

**After Phase 6:** The Telegram bot feels modern and polished with clickable buttons and a command menu.

**Total scope:** ~30 individual tasks across 7 phases. Phases 1–3 are mandatory before any release. Phases 4–6 are enhancements that significantly improve the product. Phase 7 is the final quality gate.
