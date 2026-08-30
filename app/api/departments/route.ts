import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { departments } from '@/src/server/drizzle/schema';

const standardDepartments = [
  'Engineering Department',
  'Accounts Department',
  'HR & Administration',
  'Pre-Requirement',
  'Business',
  'Registration',
  'Workplace',
];

export async function GET() {
  try {
    let deptList = await db.select().from(departments).execute();

    if (deptList.length === 0) {
      for (const name of standardDepartments) {
        await db.insert(departments).values({ name }).execute();
      }
      deptList = await db.select().from(departments).execute();
    }

    return NextResponse.json({ departments: deptList });
  } catch (error) {
    console.error('Error fetching departments:', error);
    // If DB is not connected yet, return standard department definitions as fallback
    return NextResponse.json({
      departments: standardDepartments.map((name, idx) => ({ id: idx + 1, name })),
    });
  }
}
