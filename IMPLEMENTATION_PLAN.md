# Централизация управления лобби — план имплементации

## Контекст

Сейчас управление лобби разрознено: настройки меняются через Telegram-команды (`/edit_lobby`), а подготовка к игре (факты, генерация) — через фронтенд (HostDashboard). Нужно:

1. **Фронт должен уметь всё** — редактировать настройки, кикать игроков, управлять фактами участников
2. **Телеграм-команды продолжают работать** — ничего не ломаем
3. **Факты фиксируются при /join_lobby** — копируются в контекст лобби
4. **Хост может добавлять факты от имени любого участника** (без лимита в 3)

---

## Что менять

### 1. Новая таблица `lobby_facts`

**Файл:** `src/db/migrations/006_lobby_facts.sql`

```sql
CREATE TABLE IF NOT EXISTS lobby_facts (
    id SERIAL PRIMARY KEY,
    lobby_id INT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),       -- "автор" факта
    content TEXT NOT NULL,
    added_by_host BOOLEAN DEFAULT false,                 -- true если хост добавил за участника
    source_fact_id INT REFERENCES facts(id),             -- ссылка на оригинал (NULL если добавлен хостом)
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_lobby_facts_lobby ON lobby_facts(lobby_id);
CREATE INDEX idx_lobby_facts_user ON lobby_facts(lobby_id, user_id);
```

**Зачем:** Сейчас факты глобальные (таблица `facts`, привязаны к `user_id`). При входе в лобби они копируются сюда. Дальше внутри лобби работаем только с `lobby_facts`. Если участник потом удалит/изменит свои глобальные факты — в лобби останутся зафиксированные копии.

---

### 2. Изменение `/join_lobby` — копировать факты

**Файл:** `src/bot/commands/join-lobby.js`

Что добавить после `INSERT INTO lobby_participants`:

```
1. SELECT * FROM facts WHERE user_id = <userId> (последние 3 факта)
2. Для каждого факта → INSERT INTO lobby_facts (lobby_id, user_id, content, source_fact_id)
```

**Важно:**
- Если у игрока 0 фактов — всё равно разрешаем вход (хост может потом добавить за него). Сейчас требуется ≥1 факт — **убрать эту проверку**.
- То же самое сделать при создании лобби (хост автоматически добавляется как участник) — в `create-lobby.js` копировать факты хоста.

---

### 3. Новые API-эндпоинты

**Файл:** `src/api/host.js` (дописать в существующий файл)

#### 3.1. `PUT /api/partygame/host/lobbies/:id/settings`

Обновление настроек лобби. Авторизация — через host token (как в остальных host-эндпоинтах).

**Тело запроса (все поля опциональны):**
```json
{
  "facts_per_player": 8,
  "facts_to_win": 5,
  "mode": "online",
  "password": "secret123"
}
```

**Логика:**
1. Проверить: `lobby.status === 'waiting'` (нельзя менять после генерации)
2. Валидация: `facts_to_win <= facts_per_player`
3. Если `password === null` или пустая строка — убрать пароль (SET password = NULL)
4. `UPDATE lobbies SET ... WHERE id = :id`
5. Вернуть обновлённое лобби

**Валидация значений:**
- `facts_per_player`: целое число ≥ 1
- `facts_to_win`: целое число ≥ 1 и ≤ facts_per_player
- `mode`: 'online' | 'offline'
- `password`: строка или null

#### 3.2. `DELETE /api/partygame/host/lobbies/:id/participants/:userId`

Кик игрока из лобби.

**Логика:**
1. Проверить: `lobby.status === 'waiting'`
2. Нельзя кикнуть хоста (host_id)
3. `DELETE FROM lobby_facts WHERE lobby_id = :id AND user_id = :userId`
4. `DELETE FROM lobby_participants WHERE lobby_id = :id AND user_id = :userId`
5. Вернуть `{ok: true}`

#### 3.3. `POST /api/partygame/host/lobbies/:id/participants/:userId/facts`

Хост добавляет факт от имени участника.

**Тело запроса:**
```json
{
  "content": "Я умею жонглировать тремя мячами"
}
```

**Логика:**
1. Проверить: `lobby.status === 'waiting'`
2. Проверить: участник (userId) действительно в этом лобби
3. Валидация контента: 5–500 символов
4. `INSERT INTO lobby_facts (lobby_id, user_id, content, added_by_host) VALUES (:lobbyId, :userId, :content, true)`
5. Вернуть созданный факт

#### 3.4. `DELETE /api/partygame/host/lobbies/:id/facts/:factId`

Удаление факта из лобби (вместо текущего toggle exclude).

**Логика:**
1. Проверить: `lobby.status === 'waiting'`
2. Проверить: факт принадлежит этому лобби (`lobby_facts.lobby_id = :id`)
3. `DELETE FROM lobby_facts WHERE id = :factId AND lobby_id = :id`
4. Вернуть `{ok: true}`

> **Примечание:** Текущий механизм с `excluded_facts` и toggle можно оставить для обратной совместимости, но в новом UI используем прямое удаление из `lobby_facts`.

---

### 4. Изменение существующих эндпоинтов

#### 4.1. `GET /api/partygame/host/lobbies/:id` — дашборд

**Файл:** `src/api/host.js`

Сейчас этот эндпоинт достаёт факты из глобальной таблицы `facts`. Нужно:

1. Брать факты из `lobby_facts WHERE lobby_id = :id`
2. В ответе для каждого участника показывать его `lobby_facts` (количество и список)
3. Добавить поле `added_by_host` к каждому факту, чтобы фронт мог отличить

**Формат ответа (изменения):**
```json
{
  "lobby": { /* ...текущие поля + settings */ },
  "participants": [
    {
      "user_id": 123,
      "username": "vasya",
      "first_name": "Вася",
      "facts": [
        { "id": 1, "content": "Я был в 15 странах", "added_by_host": false },
        { "id": 5, "content": "Я люблю кошек", "added_by_host": true }
      ]
    }
  ],
  "validation": {
    "canGenerate": true,
    "minPlayers": 2,
    "currentPlayers": 3,
    "totalFacts": 12,
    "requiredFacts": 9
  }
}
```

#### 4.2. `POST /api/partygame/host/lobbies/:id/generate` — генерация игры

**Файл:** `src/api/host.js`

Сейчас берёт факты из `facts`. Изменить на `lobby_facts`:

```
SELECT * FROM lobby_facts WHERE lobby_id = :id
```

Фильтровать по `excluded_facts` уже не нужно — удалённые факты просто отсутствуют в `lobby_facts`.

Остальная логика (distributeFacts, nicknames, game_assignments) — **без изменений**, просто источник данных меняется.

#### 4.3. `POST /api/partygame/host/lobbies/:id/facts/add` — добавление факта хостом

Сейчас добавляет факт в глобальную `facts` от имени хоста. Нужно изменить:

- Добавлять в `lobby_facts` (не в `facts`)
- Принимать параметр `user_id` — от чьего имени факт
- Если `user_id` не передан — считать, что от хоста

---

### 5. Фронтенд — HostDashboard

**Файл:** `frontend/src/pages/HostDashboard.jsx`

Сейчас дашборд показывает информацию, но не позволяет редактировать настройки. Добавить:

#### 5.1. Блок «Настройки лобби» (вверху дашборда)

Показывать только когда `lobby.status === 'waiting'`. Поля:

- **Фактов на игрока** — input type="number", min=1
- **Фактов до победы** — input type="number", min=1, max=facts_per_player
- **Режим** — select: online / offline
- **Пароль** — input type="text" + кнопка «Убрать пароль»
- **Кнопка «Сохранить»** → `PUT /api/partygame/host/lobbies/:id/settings`

Реализация: `useState` для каждого поля, инициализация из `lobby`. При сохранении — один PUT-запрос со всеми полями. После успеха — обновить стейт лобби.

#### 5.2. Список участников с действиями

Для каждого участника:
- Имя / username
- Количество фактов
- **Кнопка «Кик»** (❌) — `DELETE .../participants/:userId`, подтверждение через `confirm()`
- **Раскрывающийся список фактов** участника
- Каждый факт — с кнопкой удалить
- **Поле ввода + кнопка «Добавить факт»** — добавить факт от имени этого участника

Кик и управление фактами доступны только пока `lobby.status === 'waiting'`.

#### 5.3. Убрать toggle exclude

Текущий механизм «исключить/включить факт» заменить на прямое удаление из `lobby_facts`. Факт удаляется → исчезает из списка. Если нужно вернуть — хост добавит заново.

---

### 6. Порядок работы

Делай **строго последовательно**, каждый шаг — отдельный коммит:

1. **Миграция** `006_lobby_facts.sql` — создать таблицу
2. **`join-lobby.js` + `create-lobby.js`** — копирование фактов при входе
3. **Новые API-эндпоинты** в `host.js` (settings, kick, add fact, delete fact)
4. **Изменить существующие эндпоинты** (dashboard GET, generate, facts/add)
5. **Фронтенд** — блок настроек, управление участниками и фактами

---

### 7. Что НЕ трогать

- Команды Telegram (`/edit_lobby`, `/join_lobby`, `/leave_lobby` и т.д.) — **оставить как есть**. Они работают параллельно с фронтом. `/edit_lobby` меняет `lobbies` напрямую — это ок.
- Таблицу `facts` — она остаётся для глобальных фактов пользователя (добавление через бот). `lobby_facts` — копия для конкретного лобби.
- `GameScreen.jsx`, `PrintPreview.jsx` — gameplay не меняется.
- Алгоритм `generator.js` (distributeFacts, generateNicknames) — не трогаем, только меняем откуда берём факты.

---

### 8. Проверка результата

После имплементации нужно проверить:

- [ ] Хост создаёт лобби → его факты копируются в `lobby_facts`
- [ ] Игрок делает /join_lobby → его факты копируются в `lobby_facts`
- [ ] Игрок без фактов может войти (хост добавит потом)
- [ ] Хост может менять настройки через дашборд
- [ ] Хост может кикнуть игрока через дашборд
- [ ] Хост может добавить факт от имени любого участника
- [ ] Хост может удалить любой факт из лобби
- [ ] Генерация игры работает с `lobby_facts`
- [ ] Телеграм-команды продолжают работать
- [ ] /edit_lobby по-прежнему работает
