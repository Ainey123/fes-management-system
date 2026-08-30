// app/api/folders/route.ts
import { NextResponse } from 'next/server';
import { createFolder, ensureRootFolder } from '@/src/server/folders';
import { checkPermission } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { z } from 'zod';
import { getSessionUserId } from '@/src/server/auth/session';

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.number().int().positive().optional(),
});

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
