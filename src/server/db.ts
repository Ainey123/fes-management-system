import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './drizzle/schema';

// Strip any accidental surrounding quotes or whitespace from DATABASE_URL
const rawUrl = process.env.DATABASE_URL?.trim();
const connectionString = rawUrl ? rawUrl.replace(/^["']|["']$/g, '') : undefined;

const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
