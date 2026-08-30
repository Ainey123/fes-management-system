// app/api/folders/route.ts
import { NextResponse } from 'next/server';
import { createFolder, ensureRootFolder } from '@/src/server/folders';
import { checkPermission } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { z } from 'zod';
import { getSessionUserId } from '@/src/server/auth/session';
import { db } from '@/src/server/db';
import { folders } from '@/src/server/drizzle/schema';
import { and, isNull, eq } from 'drizzle-orm';

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.number().int().positive().optional(),
});

export async function GET(request: Request) {
  try {
    await ensureRootFolder();
    const { searchParams } = new URL(request.url);
    const parentIdParam = searchParams.get('parentId');

    if (parentIdParam) {
      const parentId = parseInt(parentIdParam, 10);
      const rows = await db
        .select()
        .from(folders)
        .where(and(isNull(folders.deletedAt), eq(folders.parentId, parentId)))
        .execute();
      return NextResponse.json({ folders: rows });
    }

    const allFolders = await db.select().from(folders).where(isNull(folders.deletedAt)).execute();
    return NextResponse.json({ folders: allFolders });
  } catch (error) {
    console.error('Error fetching folders:', error);
    return NextResponse.json({
      folders: [
        { id: 1, name: 'FAST ENGINEERING', parentId: null, departmentId: null },
      ],
    });
  }
}

export async function POST(request: Request) {
  // Ensure root folder exists
  await ensureRootFolder();

  const session = await getSessionUserId(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.userId;

  // Permission check for CREATE_FOLDER
  const hasPerm = await checkPermission(userId, Permission.CREATE_FOLDER, undefined);
  if (!hasPerm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parse = CreateFolderSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parse.error.errors }, { status: 400 });
  }
  const { name, parentId } = parse.data;

  try {
    const folderId = await createFolder(name, parentId, userId);
    return NextResponse.json({ folderId }, { status: 201 });
  } catch (e) {
    console.error('Error creating folder', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
