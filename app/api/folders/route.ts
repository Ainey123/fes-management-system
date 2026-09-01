// app/api/folders/route.ts
import { NextResponse } from 'next/server';
import { createFolder, ensureRootFolder } from '@/src/server/folders';
import { checkPermission, requireAuthUser } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { folders } from '@/src/server/drizzle/schema';
import { and, isNull, eq } from 'drizzle-orm';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const CreateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(255),
  parentId: z.number().int().positive().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    await ensureDatabaseTables();
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
  try {
    await ensureDatabaseTables();
    await ensureRootFolder();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    const body = await request.json();
    const parse = CreateFolderSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parse.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { name, parentId, departmentId } = parse.data;

    // Resolve department ID from parent folder if not directly specified
    let resolvedDeptId = departmentId ?? undefined;
    if (!resolvedDeptId && parentId) {
      const parentRows = await db
        .select({ departmentId: folders.departmentId })
        .from(folders)
        .where(eq(folders.id, parentId))
        .limit(1)
        .execute();
      if (parentRows.length > 0 && parentRows[0].departmentId) {
        resolvedDeptId = parentRows[0].departmentId;
      }
    }

    // Permission check
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';
    if (!isSuperAdmin) {
      const hasPerm = await checkPermission(auth.user.id, Permission.CREATE_FOLDER, resolvedDeptId);
      if (!hasPerm) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions to create folder.' },
          { status: 403 }
        );
      }
    }

    const folderId = await createFolder(
      name.trim(),
      parentId ?? undefined,
      auth.user.id,
      resolvedDeptId
    );

    return NextResponse.json(
      {
        success: true,
        message: `Folder "${name.trim()}" created successfully.`,
        folderId,
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error('Error creating folder:', e);
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

