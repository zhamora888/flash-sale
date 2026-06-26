import { createClient } from 'redis';

export type RedisClient = ReturnType<typeof createClient>;

export async function createRedisClient(redisUrl: string): Promise<RedisClient> {
  const client = createClient({ url: redisUrl });

  client.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
    // node-redis handles reconnection automatically — do not exit here
  });

  await client.connect();
  return client;
}