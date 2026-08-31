import { newDb, DataType } from 'pg-mem';
import crypto from 'crypto';

const memDb = newDb();
memDb.public.registerFunction({
  name: 'gen_random_uuid',
  returns: DataType.uuid,
  impure: true,
  implementation: () => crypto.randomUUID(),
});

const pg = memDb.adapters.createPg();

// Support Drizzle's rowMode: 'array'
const origAdapt = (pg.Client.prototype as unknown as { adaptResults: (q: unknown, r: unknown) => unknown }).adaptResults;
(pg.Client.prototype as unknown as { adaptResults: (q: unknown, r: unknown) => unknown }).adaptResults = function (query: unknown, res: unknown) {
  const q = query as { rowMode?: string };
  const r = res as { rows: Record<string, unknown>[]; fields: { name: string }[] };
  if (q && q.rowMode === 'array') {
    const qCopy = { ...q };
    delete qCopy.rowMode;
    const normal = origAdapt.call(this, qCopy, r) as typeof r;
    return {
      ...normal,
      rows: normal.rows.map((row) => Object.values(row)),
    };
  }
  return origAdapt.call(this, query, res);
};

const pool = new pg.Pool();
(global as unknown as { __TEST_POOL__: unknown }).__TEST_POOL__ = pool;
export { pool, memDb };
