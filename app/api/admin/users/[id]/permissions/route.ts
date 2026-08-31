// app/api/admin/users/[id]/permissions/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { users, permissions, userDepartmentAccess } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { logAction } from '@/src/server/audit';
import { allPermissions } from '@/src/server/permissions';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const UpdatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
  departmentId: z.number().int().positive().optional(),
});

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;

    const { id } = await props.params;

    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email, departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accessRows = await db
      .select({ permissionName: permissions.name })
      .from(userDepartmentAccess)
      .leftJoin(permissions, eq(userDepartmentAccess.permissionId, permissions.id))
      .where(eq(userDepartmentAccess.userId, id))
      .execute();

    const userPerms = accessRows.map((a) => a.permissionName).filter(Boolean) as string[];

    return NextResponse.json({
      userId: id,
      userName: userRows[0].name,
      departmentId: userRows[0].departmentId,
      assignedPermissions: userPerms,
      availablePermissions: allPermissions,
    });
  } catch (error: unknown) {
    console.error('Error fetching permissions:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch permissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const adminUser = authCheck.auth!.user;

    const { id } = await props.params;

    const body = await request.json();
    const parseResult = UpdatePermissionsSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid permissions payload', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Check user exists
    const userRows = await db
      .select({ id: users.id, name: users.name, departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const departmentId = data.departmentId || userRows[0].departmentId;
    if (!departmentId) {
      return NextResponse.json(
        { error: 'User must be assigned to a department before configuring department permissions.' },
        { status: 400 }
      );
    }

    // Delete existing permissions for user in user_department_access
    await db
      .delete(userDepartmentAccess)
      .where(eq(userDepartmentAccess.userId, id))
      .execute();

    // Fetch all permission IDs from permissions table
    const allPermRows = await db.select().from(permissions).execute();
    const permMap = new Map(allPermRows.map((p) => [p.name, p.id]));

    const accessInserts: { userId: string; departmentId: number; permissionId: number }[] = [];
    for (const permName of data.permissions) {
      let permId = permMap.get(permName);
      if (!permId) {
        const insertRes = await db
          .insert(permissions)
          .values({ name: permName })
          .returning({ id: permissions.id })
          .execute();
        permId = insertRes[0].id;
        permMap.set(permName, permId);
      }
      accessInserts.push({
        userId: id,
        departmentId,
        permissionId: permId,
      });
    }

    if (accessInserts.length > 0) {
      await db.insert(userDepartmentAccess).values(accessInserts).execute();
    }

    // Audit log
    await logAction(adminUser.id, 'PERMISSIONS_CHANGED', 'user', id, {
      userName: userRows[0].name,
      departmentId,
      assignedPermissions: data.permissions,
    });

    return NextResponse.json({
      success: true,
      message: 'Employee permissions updated successfully.',
      permissions: data.permissions,
    });
  } catch (error: unknown) {
    console.error('Error updating permissions:', error);
    const message = error instanceof Error ? error.message : 'Failed to update permissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
