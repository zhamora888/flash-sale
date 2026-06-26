/**
 * Stress test runner using autocannon.
 *
 * Scenario A: N unique buyers. Expects exactly STOCK_QUANTITY successes.
 * Scenario B: Same userId, 500 concurrent requests. Expects exactly 1 success.
 *
 * Usage: npm run stress (server must be running on http://localhost:3001)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const autocannon = require('autocannon');
import { createClient } from 'redis';

const BASE_URL = process.env['STRESS_TARGET'] ?? 'http://localhost:3001';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const STOCK_QUANTITY = parseInt(process.env['STOCK_QUANTITY'] ?? '100', 10);

interface AutocannonResult {
  requests: { total: number };
  statusCodeStats: Record<string, { count: number }>;
  latency: { mean: number; p99: number };
  throughput: { mean: number };
  errors: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetRedis(): Promise<void> {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  await client.set('flash:stock', STOCK_QUANTITY);

  let cleared = 0;
  let cursor = 0;
  do {
    const reply = await client.scan(cursor, { MATCH: 'flash:purchased:*', COUNT: 100 });
    cursor = reply.cursor;
    if (reply.keys.length > 0) {
      await client.del(reply.keys);
      cleared += reply.keys.length;
    }
  } while (cursor !== 0);

  await client.disconnect();
  console.log(`[Reset] flash:stock = ${STOCK_QUANTITY}, cleared ${cleared} purchase record(s).`);
}

async function runScenario(
  title: string,
  config: Record<string, unknown>
): Promise<AutocannonResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario: ${title}`);
  console.log('='.repeat(60));

  return new Promise((resolve, reject) => {
    const instance = autocannon(config, (err: Error | null, result: AutocannonResult) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

function printSummary(title: string, result: AutocannonResult, expectedSuccesses: number): void {
  const successCount = result.statusCodeStats['200']?.count ?? 0;
  const conflictCount = result.statusCodeStats['409']?.count ?? 0;
  const goneCount = result.statusCodeStats['410']?.count ?? 0;
  const errorCount = result.errors;

  const passed = successCount === expectedSuccesses;

  console.log(`\n--- ${title} Summary ---`);
  console.log(`  Total requests    : ${result.requests.total}`);
  console.log(`  200 (success)     : ${successCount}`);
  console.log(`  409 (duplicate)   : ${conflictCount}`);
  console.log(`  410 (sold out)    : ${goneCount}`);
  console.log(`  Errors            : ${errorCount}`);
  console.log(`  Latency mean      : ${result.latency.mean} ms`);
  console.log(`  Latency p99       : ${result.latency.p99} ms`);
  console.log(`  Throughput mean   : ${Math.round(result.throughput.mean / 1024)} KB/s`);
  console.log(`  Expected successes: ${expectedSuccesses}`);
  console.log(`  Actual successes  : ${successCount}`);
  console.log(`  ASSERTION         : ${passed ? 'PASS' : 'FAIL'}`);

  if (!passed) {
    console.error(`\n[FAIL] ${title}: Expected ${expectedSuccesses} successes but got ${successCount}`);
  }
}

async function scenarioA(): Promise<void> {
  // autocannon cycles its requests array from index 0 independently per connection,
  // so sharing a requests array across N connections always reuses the same first-N
  // entries. Native fetch + Promise.all fires every request truly concurrently with
  // a guaranteed-unique userId per request.
  const amount = STOCK_QUANTITY + 50;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario: Scenario A — Unique Buyers (STOCK_QUANTITY=${STOCK_QUANTITY}, amount=${amount})`);
  console.log('='.repeat(60));

  const start = Date.now();
  const statuses = await Promise.all(
    Array.from({ length: amount }, (_, i) =>
      fetch(`${BASE_URL}/api/purchase`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: `stress-a-user-${i + 1}` }),
      })
        .then((r) => r.status)
        .catch(() => 0),
    ),
  );
  const elapsed = Date.now() - start;

  const successCount = statuses.filter((s) => s === 200).length;
  const soldOutCount = statuses.filter((s) => s === 410).length;
  const errorCount = statuses.filter((s) => s === 0).length;
  const passed = successCount === STOCK_QUANTITY;

  console.log(`\n--- Scenario A Summary ---`);
  console.log(`  Total requests    : ${amount}`);
  console.log(`  200 (success)     : ${successCount}`);
  console.log(`  410 (sold out)    : ${soldOutCount}`);
  console.log(`  Errors            : ${errorCount}`);
  console.log(`  Duration          : ${elapsed} ms`);
  console.log(`  Expected successes: ${STOCK_QUANTITY}`);
  console.log(`  Actual successes  : ${successCount}`);
  console.log(`  ASSERTION         : ${passed ? 'PASS' : 'FAIL'}`);

  if (!passed) {
    console.error(`\n[FAIL] Scenario A: Expected ${STOCK_QUANTITY} successes but got ${successCount}`);
  }
}

async function scenarioB(): Promise<void> {
  const amount = 500;
  const userId = `stress-b-single-user-${Date.now()}`;

  const result = await runScenario(
    `Scenario B — Duplicate Storm (same userId, ${amount} concurrent)`,
    {
      url: `${BASE_URL}/api/purchase`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
      connections: 100,
      amount,
      timeout: 30,
    }
  );

  printSummary('Scenario B', result, 1);
}

async function main(): Promise<void> {
  console.log(`\nFlash Sale Stress Test`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`STOCK_QUANTITY: ${STOCK_QUANTITY}`);
  console.log('\nMake sure the server is running and Redis is populated with the correct stock.');
  console.log('Waiting 2s before starting...');
  await delay(2000);

  try {
    await resetRedis();
    await scenarioA();
    await delay(1000);
    await resetRedis();
    await scenarioB();
    console.log('\nStress test complete.');
  } catch (err) {
    console.error('Stress test failed:', err);
    process.exit(1);
  }
}

main();