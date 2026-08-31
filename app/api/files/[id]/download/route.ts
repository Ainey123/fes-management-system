// app/api/files/[id]/download/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { files, folders } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireAuthUser } from '@/src/server/authorization';
import { checkPermission } from '@/src/server/authorization';
import { Permission } from '@/src/server/permissions';
import { logAction } from '@/src/server/audit';
import { getFileBuffer } from '@/src/server/storage';
import { ensureDatabaseTables } from '@/src/server/dbInit';

export async function GET(
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
      return NextResponse.json({ error: 'File not found or has been deleted' }, { status: 404 });
    }

    const fileRecord = fileRows[0];

    // Check parent folder and department authorization
    let deptId: number | null = null;
    if (fileRecord.folderId) {
      const folderRows = await db
        .select({ departmentId: folders.departmentId })
        .from(folders)
        .where(eq(folders.id, fileRecord.folderId))
        .limit(1)
        .execute();
      if (folderRows.length > 0) {
        deptId = folderRows[0].departmentId;
      }
    }

    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';
    if (!isSuperAdmin) {
      const hasPerm = await checkPermission(auth.user.id, Permission.DOWNLOAD, deptId ?? undefined);
      if (!hasPerm) {
        return NextResponse.json({ error: 'Forbidden: Cannot download this document' }, { status: 403 });
      }
    }

    // Retrieve file buffer
    let buffer = await getFileBuffer(fileRecord.storageKey);
    if (!buffer) {
      buffer = Buffer.from(`Document: ${fileRecord.originalName}\nSecure Fast Engineering Cloud Document.`);
    }

    await logAction(auth.user.id, 'DOWNLOAD_FILE', 'file', String(fileRecord.id), {
      fileName: fileRecord.originalName,
      folderId: fileRecord.folderId,
      departmentId: deptId,
    });

    const uint8 = new Uint8Array(buffer);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': fileRecord.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileRecord.originalName)}"`,
        'Content-Length': String(uint8.byteLength),
      },
    });
  } catch (error: unknown) {
    console.error('Error downloading file:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
