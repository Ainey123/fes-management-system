import { NextResponse } from 'next/server';
import { pool } from '@/src/server/db';
import { ensureDatabaseTables } from '@/src/server/dbInit';

export async function GET() {
  const hasDbUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasSessionSecret = Boolean(process.env.SESSION_SECRET?.trim());

  if (!hasDbUrl) {
    return NextResponse.json({
      status: 'error',
      message: 'DATABASE_URL is missing in Vercel Environment Variables. Please add it and redeploy.',
      env: { DATABASE_URL: false, SESSION_SECRET: hasSessionSecret },
    }, { status: 500 });
  }

  try {
    await ensureDatabaseTables();

    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    const tableNames = res.rows.map((r: { table_name: string }) => r.table_name);

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      tablesCount: tableNames.length,
      tables: tableNames,
      env: { DATABASE_URL: true, SESSION_SECRET: hasSessionSecret },
    });
  } catch (error: unknown) {
    console.error('Health check failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown database error';
    return NextResponse.json({
      status: 'error',
      database: 'failed_to_connect',
      error: message,
      env: { DATABASE_URL: true, SESSION_SECRET: hasSessionSecret },
    }, { status: 500 });
  }
}
