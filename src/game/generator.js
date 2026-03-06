// Russian nicknames (adjectives + nouns combinations)
const adjectives = [
  'Веселый', 'Ленивый', 'Быстрый', 'Медленный', 'Смелый', 'Робкий',
  'Умный', 'Глупый', 'Красивый', 'Некрасивый', 'Добрый', 'Злой',
  'Честный', 'Лживый', 'Тихий', 'Громкий', 'Плюшевый', 'Колючий',
  'Горячий', 'Холодный', 'Танцующий', 'Ленящийся', 'Мудрый', 'Наивный',
  'Сильный', 'Слабый', 'Золотой', 'Серебряный', 'Чёрный', 'Белый',
  'Ночной', 'Дневной', 'Летучий', 'Стройный', 'Пухлый', 'Острый',
  'Мягкий', 'Жёсткий', 'Грустный', 'Влажный', 'Сухой',
  'Грязный', 'Чистый', 'Новый', 'Старый', 'Молодой', 'Пожилой'
];

const nouns = [
  'Кот', 'Пёс', 'Лиса', 'Волк', 'Медведь', 'Заяц', 'Ёж', 'Белка',
  'Сова', 'Орёл', 'Ворона', 'Снегирь', 'Рыба', 'Акула', 'Дельфин',
  'Крокодил', 'Черепаха', 'Лягушка', 'Тигр', 'Лев', 'Слон', 'Обезьяна',
  'Жираф', 'Зебра', 'Пингвин', 'Фламинго', 'Страус', 'Попугай', 'Щёлкун',
  'Мотылёк', 'Паук', 'Комар', 'Оса', 'Пчела', 'Муравей', 'Стрекоза',
  'Кузнечик', 'Улитка', 'Осьминог', 'Крабик', 'Креветка', 'Черви', 'Сорока',
  'Галка', 'Аист', 'Утка', 'Гусь', 'Лебедь', 'Кукушка', 'Соловей'
];

/**
 * Generate unique nicknames for all participants
 * @param {number} participantCount - Number of participants
 * @returns {Array<string>} Array of unique nicknames
 */
export function generateNicknames(participantCount) {
  if (participantCount > adjectives.length * nouns.length) {
    throw new Error('Not enough nickname combinations for this many participants');
  }

  const used = new Set();
  const nicknames = [];

  while (nicknames.length < participantCount) {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const nickname = `${adj} ${noun}`;

    if (!used.has(nickname)) {
      used.add(nickname);
      nicknames.push(nickname);
    }
  }

  return nicknames;
}

/**
 * Distribute facts among players ensuring:
 * - No player gets their own fact
 * - No duplicate facts from same source
 * - Even distribution
 * @param {Array<Object>} facts - Array of {userId, factId} objects
 * @param {Array<number>} participantUserIds - Array of user IDs
 * @param {number} factsPerPlayer - Number of facts each player should receive
 * @returns {Array<Object>} Array of {factId, assignedToUserId, fromUserId}
 */
export function distributeFacts(facts, participantUserIds, factsPerPlayer) {
  if (facts.length < participantUserIds.length * factsPerPlayer) {
    throw new Error('Not enough facts for fair distribution');
  }

  // Validate: no player gets their own fact
  // Validate: no duplicate facts from same person
  const userFactMap = new Map();
  for (const fact of facts) {
    if (!userFactMap.has(fact.userId)) {
      userFactMap.set(fact.userId, []);
    }
    userFactMap.get(fact.userId).push(fact);
  }

  // Check that no user has too many facts
  for (const [userId, userFacts] of userFactMap.entries()) {
    if (userFacts.length > participantUserIds.length * factsPerPlayer) {
      // This is okay, we'll just select from their facts
    }
  }

  const assignments = [];
  const participantFactCounts = new Map();
  for (const userId of participantUserIds) {
    participantFactCounts.set(userId, 0);
  }

  const shuffledFacts = [...facts].sort(() => Math.random() - 0.5);

  for (const fact of shuffledFacts) {
    // Skip if this participant already has enough facts
    for (const targetUserId of participantUserIds) {
      if (Number(targetUserId) === Number(fact.userId)) {
        // Skip own facts
        continue;
      }

      const currentCount = participantFactCounts.get(targetUserId) || 0;
      if (currentCount < factsPerPlayer) {
        // Check if target user already has a fact from this source
        const hasFactFromSource = assignments.some(
          a => a.assignedToUserId === targetUserId && a.fromUserId === fact.userId
        );

        if (!hasFactFromSource) {
          assignments.push({
            factId: fact.factId,
            assignedToUserId: targetUserId,
            fromUserId: fact.userId,
          });
          participantFactCounts.set(targetUserId, currentCount + 1);
          break;
        }
      }
    }
  }

  // Verify we have enough assignments
  const totalNeeded = participantUserIds.length * factsPerPlayer;
  if (assignments.length < totalNeeded) {
    throw new Error(
      `Could not distribute facts fairly. Got ${assignments.length}, needed ${totalNeeded}`
    );
  }

  return assignments;
}

/**
 * Validate fact distribution
 * @param {Array<Object>} assignments - Array of assignments
 * @param {Array<number>} participantUserIds - Array of participant user IDs
 * @param {number} factsPerPlayer - Expected facts per player
 * @returns {boolean} Whether distribution is valid
 */
export function validateDistribution(assignments, participantUserIds, factsPerPlayer) {
  // Check each participant has correct number of facts
  const counts = new Map();
  for (const userId of participantUserIds) {
    counts.set(userId, 0);
  }

  for (const assignment of assignments) {
    const count = counts.get(assignment.assignedToUserId) || 0;
    counts.set(assignment.assignedToUserId, count + 1);

    // Check no own facts
    if (assignment.assignedToUserId === assignment.fromUserId) {
      console.error('❌ Validation failed: player has own fact');
      return false;
    }
  }

  // Check all participants have exactly factsPerPlayer facts
  for (const [userId, count] of counts.entries()) {
    if (count !== factsPerPlayer) {
      console.error(`❌ Validation failed: user ${userId} has ${count} facts, expected ${factsPerPlayer}`);
      return false;
    }
  }

  return true;
}
