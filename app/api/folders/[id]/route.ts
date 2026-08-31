// app/api/folders/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { folders } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireAuthUser } from '@/src/server/authorization';
import { checkPermission } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { renameFolder, moveFolder, softDeleteFolder } from '@/src/server/folders';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    const { id: folderIdParam } = await props.params;
    const folderId = parseInt(folderIdParam, 10);
    if (isNaN(folderId) || folderId <= 0) {
      return NextResponse.json({ error: 'Invalid folder ID' }, { status: 400 });
    }

    const body = await request.json();
    const parse = UpdateFolderSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parse.error.errors }, { status: 400 });
    }

    const folderRows = await db
      .select()
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1)
      .execute();

    if (folderRows.length === 0 || folderRows[0].deletedAt) {
      return NextResponse.json({ error: 'Folder not found or deleted' }, { status: 404 });
    }

    const targetFolder = folderRows[0];
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';

    if (parse.data.name) {
      if (!isSuperAdmin) {
        const canEdit = await checkPermission(auth.user.id, Permission.EDIT, targetFolder.departmentId ?? undefined);
        if (!canEdit) {
          return NextResponse.json({ error: 'Forbidden: Insufficient edit permissions' }, { status: 403 });
        }
      }
      await renameFolder(folderId, parse.data.name.trim(), auth.user.id);
    }

    if (parse.data.parentId !== undefined) {
      if (!isSuperAdmin) {
        const canMove = await checkPermission(auth.user.id, Permission.MOVE, targetFolder.departmentId ?? undefined);
        if (!canMove) {
          return NextResponse.json({ error: 'Forbidden: Insufficient move permissions' }, { status: 403 });
        }
      }
      await moveFolder(folderId, parse.data.parentId, auth.user.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Folder updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating folder:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    const { id: folderIdParam } = await props.params;
    const folderId = parseInt(folderIdParam, 10);
    if (isNaN(folderId) || folderId <= 0) {
      return NextResponse.json({ error: 'Invalid folder ID' }, { status: 400 });
    }

    const folderRows = await db
      .select()
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1)
      .execute();

    if (folderRows.length === 0 || folderRows[0].deletedAt) {
      return NextResponse.json({ error: 'Folder not found or deleted' }, { status: 404 });
    }

    const targetFolder = folderRows[0];
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';

    // Cannot delete Root folder
    if (!targetFolder.parentId) {
      return NextResponse.json({ error: 'Cannot delete root folder' }, { status: 400 });
    }

    if (!isSuperAdmin) {
      const canDelete = await checkPermission(auth.user.id, Permission.DELETE, targetFolder.departmentId ?? undefined);
      if (!canDelete) {
        return NextResponse.json({ error: 'Forbidden: Insufficient delete permissions' }, { status: 403 });
      }
    }

    await softDeleteFolder(folderId, auth.user.id);

    return NextResponse.json({
      success: true,
      message: `Folder "${targetFolder.name}" moved to Trash.`,
    });
  } catch (error: unknown) {
    console.error('Error deleting folder:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
