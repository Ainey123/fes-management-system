// src/scripts/seedPermissions.ts
import { db } from '../server/db';
import { eq } from 'drizzle-orm';
import { permissions } from '../server/drizzle/schema';
import { allPermissions } from '../server/permissions';

async function seed() {
  for (const name of allPermissions) {
    const existing = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.name, name))
      .limit(1)
      .execute();
    if (existing.length === 0) {
      await db.insert(permissions).values({ name }).execute();
      console.log(`Inserted permission ${name}`);
    }
  }
}

seed().catch((e) => {
  console.error('Error seeding permissions', e);
  process.exit(1);
});
