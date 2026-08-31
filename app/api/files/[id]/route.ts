// app/api/files/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { files, folders, users } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireAuthUser } from '@/src/server/authorization';
import { checkPermission } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { logAction } from '@/src/server/audit';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const UpdateFileSchema = z.object({
  originalName: z.string().min(1).max(255).optional(),
  folderId: z.number().int().positive().optional(),
});

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;

    const { id: fileIdParam } = await props.params;
    const fileId = parseInt(fileIdParam, 10);
    if (isNaN(fileId) || fileId <= 0) {
      return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
    }

    const fileRows = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)
      .execute();

    if (fileRows.length === 0 || fileRows[0].deletedAt) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileRecord = fileRows[0];
    let uploaderName = 'System';
    let uploaderEmail = '';

    if (fileRecord.uploadedBy) {
      const uploaderRows = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, fileRecord.uploadedBy))
        .limit(1)
        .execute();
      if (uploaderRows.length > 0) {
        uploaderName = uploaderRows[0].name;
        uploaderEmail = uploaderRows[0].email;
      }
    }

    return NextResponse.json({
      file: {
        id: fileRecord.id,
        originalName: fileRecord.originalName,
        mimeType: fileRecord.mimeType,
        size: fileRecord.size,
        folderId: fileRecord.folderId,
        uploadedAt: fileRecord.uploadedAt,
        uploadedByName: uploaderName,
        uploadedByEmail: uploaderEmail,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching file details:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    const { id: fileIdParam } = await props.params;
    const fileId = parseInt(fileIdParam, 10);
    if (isNaN(fileId) || fileId <= 0) {
      return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
    }

    const body = await request.json();
    const parse = UpdateFileSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parse.error.errors }, { status: 400 });
    }

    const fileRows = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)
      .execute();

    if (fileRows.length === 0 || fileRows[0].deletedAt) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileRecord = fileRows[0];
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';

    let deptId: number | null = null;
    if (fileRecord.folderId) {
      const folderRows = await db
        .select({ departmentId: folders.departmentId })
        .from(folders)
        .where(eq(folders.id, fileRecord.folderId))
        .limit(1)
        .execute();
      if (folderRows.length > 0) deptId = folderRows[0].departmentId;
    }

    const updateData: Partial<typeof files.$inferInsert> = {};

    if (parse.data.originalName) {
      if (!isSuperAdmin) {
        const canEdit = await checkPermission(auth.user.id, Permission.EDIT, deptId ?? undefined);
        if (!canEdit) {
          return NextResponse.json({ error: 'Forbidden: Insufficient edit permissions' }, { status: 403 });
        }
      }
      updateData.originalName = parse.data.originalName.trim();
      await logAction(auth.user.id, 'RENAME_FILE', 'file', String(fileId), {
        oldName: fileRecord.originalName,
        newName: parse.data.originalName.trim(),
      });
    }

    if (parse.data.folderId !== undefined) {
      if (!isSuperAdmin) {
        const canMove = await checkPermission(auth.user.id, Permission.MOVE, deptId ?? undefined);
        if (!canMove) {
          return NextResponse.json({ error: 'Forbidden: Insufficient move permissions' }, { status: 403 });
        }
      }
      updateData.folderId = parse.data.folderId;
      await logAction(auth.user.id, 'MOVE_FILE', 'file', String(fileId), {
        oldFolderId: fileRecord.folderId,
        newFolderId: parse.data.folderId,
      });
    }

    await db.update(files).set(updateData).where(eq(files.id, fileId)).execute();

    return NextResponse.json({
      success: true,
      message: 'File updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating file:', error);
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

    const { id: fileIdParam } = await props.params;
    const fileId = parseInt(fileIdParam, 10);
    if (isNaN(fileId) || fileId <= 0) {
      return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
    }

    const fileRows = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)
      .execute();

    if (fileRows.length === 0 || fileRows[0].deletedAt) {
      return NextResponse.json({ error: 'File not found or already deleted' }, { status: 404 });
    }

    const fileRecord = fileRows[0];
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';

    let deptId: number | null = null;
    if (fileRecord.folderId) {
      const folderRows = await db
        .select({ departmentId: folders.departmentId })
        .from(folders)
        .where(eq(folders.id, fileRecord.folderId))
        .limit(1)
        .execute();
      if (folderRows.length > 0) deptId = folderRows[0].departmentId;
    }

    if (!isSuperAdmin) {
      const canDelete = await checkPermission(auth.user.id, Permission.DELETE, deptId ?? undefined);
      if (!canDelete) {
        return NextResponse.json({ error: 'Forbidden: Insufficient delete permissions' }, { status: 403 });
      }
    }

    await db
      .update(files)
      .set({
        deletedAt: new Date(),
        deletedBy: auth.user.id,
      })
      .where(eq(files.id, fileId))
      .execute();

    await logAction(auth.user.id, 'DELETE_FILE', 'file', String(fileId), {
      fileName: fileRecord.originalName,
      folderId: fileRecord.folderId,
      departmentId: deptId,
    });

    return NextResponse.json({
      success: true,
      message: `File "${fileRecord.originalName}" moved to Trash.`,
    });
  } catch (error: unknown) {
    console.error('Error deleting file:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
