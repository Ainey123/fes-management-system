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

    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';
    let resolvedDeptId: number | undefined;

    if (!isSuperAdmin) {
      // Normal Employee RBAC & Department Isolation
      if (!parentId) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot create folders at root level. Target parent folder is required.' },
          { status: 403 }
        );
      }

      // Fetch target parent folder
      const parentRows = await db
        .select()
        .from(folders)
        .where(and(eq(folders.id, parentId), isNull(folders.deletedAt)))
        .limit(1)
        .execute();

      if (parentRows.length === 0) {
        return NextResponse.json(
          { error: 'Target parent folder not found or has been deleted.' },
          { status: 404 }
        );
      }

      const parentFolder = parentRows[0];

      if (!parentFolder.departmentId) {
        return NextResponse.json(
          { error: 'Forbidden: Cannot create folders outside of an authorized department.' },
          { status: 403 }
        );
      }

      // Department isolation: parent folder must belong to employee's authorized department
      if (auth.user.departmentId && parentFolder.departmentId !== auth.user.departmentId) {
        return NextResponse.json(
          { error: 'Forbidden: Parent folder belongs to another department.' },
          { status: 403 }
        );
      }

      // If departmentId was sent, verify it matches parent folder's department
      if (departmentId && departmentId !== parentFolder.departmentId) {
        return NextResponse.json(
          { error: 'Forbidden: Department ID mismatch with target parent folder.' },
          { status: 403 }
        );
      }

      resolvedDeptId = parentFolder.departmentId;

      // Check CREATE_FOLDER permission in user_department_access
      const hasPerm = await checkPermission(auth.user.id, Permission.CREATE_FOLDER, resolvedDeptId);
      if (!hasPerm) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have CREATE_FOLDER permission for this department.' },
          { status: 403 }
        );
      }
    } else {
      // Admin / Super Admin
      resolvedDeptId = departmentId ?? undefined;
      if (parentId) {
        const parentRows = await db
          .select({ departmentId: folders.departmentId })
          .from(folders)
          .where(and(eq(folders.id, parentId), isNull(folders.deletedAt)))
          .limit(1)
          .execute();

        if (parentRows.length === 0) {
          return NextResponse.json(
            { error: 'Target parent folder not found or has been deleted.' },
            { status: 404 }
          );
        }

        if (!resolvedDeptId && parentRows[0].departmentId) {
          resolvedDeptId = parentRows[0].departmentId;
        }
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
        departmentId: resolvedDeptId,
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error('Error creating folder:', e);
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


