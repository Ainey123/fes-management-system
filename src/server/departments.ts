import { db } from './db';
import { departments } from './drizzle/schema';
import { eq } from 'drizzle-orm';

/** Get all departments */
export async function getAllDepartments() {
  return await db.select().from(departments).execute();
}

/** Get a department by ID */
export async function getDepartmentById(id: number) {
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.id, id))
    .limit(1)
    .execute();
  return rows[0] ?? null;
}

/** Create a new department */
export async function createDepartment(name: string) {
  const inserted = await db
    .insert(departments)
    .values({ name })
    .returning({ id: departments.id })
    .execute();
  return inserted[0];
}
