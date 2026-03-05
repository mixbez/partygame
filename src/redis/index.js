import { createClient } from 'redis';

let redisClient;

export async function initRedis() {
  redisClient = createClient({
    url: process.env.REDIS_URL,
  });

  redisClient.on('error', (err) => console.error('🔴 Redis error:', err));
  redisClient.on('connect', () => console.log('✅ Redis connected'));

  await redisClient.connect();
  console.log('✅ Redis initialized');
}

export function getRedis() {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redisClient;
}

function getKey(key) {
  const prefix = process.env.REDIS_KEY_PREFIX || 'partygame:';
  return `${prefix}${key}`;
}

export const redis = {
  async set(key, value, ttl = null) {
    const client = getRedis();
    const options = {};
    if (ttl) {
      options.EX = ttl;
    }
    return await client.set(getKey(key), JSON.stringify(value), options);
  },

  async get(key) {
    const client = getRedis();
    const value = await client.get(getKey(key));
    return value ? JSON.parse(value) : null;
  },

  async del(key) {
    const client = getRedis();
    return await client.del(getKey(key));
  },

  async exists(key) {
    const client = getRedis();
    return await client.exists(getKey(key));
  },

  async expire(key, ttl) {
    const client = getRedis();
    return await client.expire(getKey(key), ttl);
  },

  async hset(key, field, value) {
    const client = getRedis();
    return await client.hSet(getKey(key), field, JSON.stringify(value));
  },

  async hget(key, field) {
    const client = getRedis();
    const value = await client.hGet(getKey(key), field);
    return value ? JSON.parse(value) : null;
  },

  async hgetall(key) {
    const client = getRedis();
    const data = await client.hGetAll(getKey(key));
    const result = {};
    for (const [k, v] of Object.entries(data)) {
      result[k] = JSON.parse(v);
    }
    return result;
  },

  async hdel(key, field) {
    const client = getRedis();
    return await client.hDel(getKey(key), field);
  },

  getKey,
};

export async function closeRedis() {
  if (redisClient) {
    await redisClient.disconnect();
  }
}
