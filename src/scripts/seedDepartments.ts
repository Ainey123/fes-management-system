// src/scripts/seedDepartments.ts
import { db } from '../server/db';
import { departments } from '../server/drizzle/schema';
import { eq } from 'drizzle-orm';

const departmentNames = [
  'Engineering Department',
  'Accounts Department',
  'HR & Administration',
  'Pre-Requirement',
  'Business',
  'Registration',
  'Workplace',
];

async function seed() {
  for (const name of departmentNames) {
    const existing = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.name, name))
      .limit(1)
      .execute();
    if (existing.length === 0) {
      await db.insert(departments).values({ name }).execute();
    }
  }
  console.log('Departments seeded');
}

seed().catch((e) => {
  console.error('Error seeding departments', e);
  process.exit(1);
});
