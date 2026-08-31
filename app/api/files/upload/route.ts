// app/api/files/upload/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { files, folders } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireAuthUser } from '@/src/server/authorization';
import { checkPermission } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { logAction } from '@/src/server/audit';
import { saveFileBuffer } from '@/src/server/storage';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

export async function POST(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderIdStr = formData.get('folderId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!folderIdStr) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
    }

    const folderId = parseInt(folderIdStr, 10);
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
      return NextResponse.json({ error: 'Target folder not found' }, { status: 404 });
    }

    const targetFolder = folderRows[0];
    const targetDeptId = targetFolder.departmentId;

    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';
    if (!isSuperAdmin) {
      const hasPerm = await checkPermission(auth.user.id, Permission.UPLOAD, targetDeptId ?? undefined);
      if (!hasPerm) {
        return NextResponse.json({ error: 'Forbidden: Insufficient upload permissions' }, { status: 403 });
      }
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds maximum 50MB limit' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { storageKey } = await saveFileBuffer(buffer, file.name);

    const inserted = await db
      .insert(files)
      .values({
        originalName: file.name,
        storageKey,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        folderId,
        uploadedBy: auth.user.id,
      })
      .returning()
      .execute();

    const createdFile = inserted[0];

    await logAction(auth.user.id, 'UPLOAD_FILE', 'file', String(createdFile.id), {
      fileName: file.name,
      fileSize: file.size,
      folderId,
      departmentId: targetDeptId,
    });

    return NextResponse.json({
      success: true,
      file: {
        id: createdFile.id,
        originalName: createdFile.originalName,
        size: createdFile.size,
        mimeType: createdFile.mimeType,
        folderId: createdFile.folderId,
        uploadedAt: createdFile.uploadedAt,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error uploading file:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
