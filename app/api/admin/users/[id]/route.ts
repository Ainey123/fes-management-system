// app/api/admin/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { users, roles, departments, permissions, userDepartmentAccess } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { logAction } from '@/src/server/audit';
import { deleteUserSessions } from '@/src/server/auth/session';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
  role: z.string().optional(),
  departmentId: z.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'DELETED']).optional(),
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
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        departmentId: users.departmentId,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastLoginAt: users.lastLoginAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const u = userRows[0];

    // Fetch role name, department name, permissions
    const [roleRows, deptRows, accessRows] = await Promise.all([
      u.roleId ? db.select().from(roles).where(eq(roles.id, u.roleId)).limit(1).execute() : Promise.resolve([]),
      u.departmentId ? db.select().from(departments).where(eq(departments.id, u.departmentId)).limit(1).execute() : Promise.resolve([]),
      db
        .select({ permissionName: permissions.name })
        .from(userDepartmentAccess)
        .leftJoin(permissions, eq(userDepartmentAccess.permissionId, permissions.id))
        .where(eq(userDepartmentAccess.userId, u.id))
        .execute(),
    ]);

    const roleName = roleRows[0]?.name || 'employee';
    const deptName = deptRows[0]?.name || 'Unassigned';
    const userPermissions = accessRows.map((a) => a.permissionName).filter(Boolean) as string[];

    return NextResponse.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        roleId: u.roleId,
        role: roleName,
        departmentId: u.departmentId,
        departmentName: deptName,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        lastLoginAt: u.lastLoginAt,
        deletedAt: u.deletedAt,
        permissions: userPermissions,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching user:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch user';
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
    const parseResult = UpdateUserSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Check user exists
    const existingUserRows = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();

    if (existingUserRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const current = existingUserRows[0];

    // If changing email, check uniqueness
    if (data.email && data.email.toLowerCase().trim() !== current.email.toLowerCase()) {
      const emailCheck = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, data.email.toLowerCase().trim()))
        .limit(1)
        .execute();
      if (emailCheck.length > 0) {
        return NextResponse.json({ error: 'This email address is already in use.' }, { status: 409 });
      }
    }

    // Role resolution if role name was provided
    let newRoleId = current.roleId;
    if (data.role) {
      const roleSearch = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, data.role.toLowerCase()))
        .limit(1)
        .execute();

      if (roleSearch.length > 0) {
        newRoleId = roleSearch[0].id;
      } else {
        const insertedRole = await db
          .insert(roles)
          .values({ name: data.role.toLowerCase() })
          .returning({ id: roles.id })
          .execute();
        newRoleId = insertedRole[0].id;
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name) updates.name = data.name.trim();
    if (data.email) updates.email = data.email.toLowerCase().trim();
    if (data.role) updates.roleId = newRoleId;
    if (data.status) updates.status = data.status;

    let departmentChanged = false;
    if (data.departmentId !== undefined && data.departmentId !== current.departmentId) {
      updates.departmentId = data.departmentId;
      departmentChanged = true;
    }

    await db.update(users).set(updates).where(eq(users.id, id)).execute();

    // If department changed, update department in user_department_access table
    if (departmentChanged && data.departmentId) {
      await db
        .update(userDepartmentAccess)
        .set({ departmentId: data.departmentId })
        .where(eq(userDepartmentAccess.userId, id))
        .execute();

      await logAction(adminUser.id, 'DEPARTMENT_CHANGED', 'user', id, {
        previousDepartmentId: current.departmentId,
        newDepartmentId: data.departmentId,
      });
    }

    await logAction(adminUser.id, 'USER_EDITED', 'user', id, {
      changedFields: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return NextResponse.json({
      success: true,
      message: 'Employee details updated successfully.',
    });
  } catch (error: unknown) {
    console.error('Error updating user:', error);
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const adminUser = authCheck.auth!.user;

    const { id } = await props.params;

    // Prevent Super Admin from deleting themselves
    if (id === adminUser.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own Super Administrator account.' },
        { status: 400 }
      );
    }

    // Soft delete the user
    await db
      .update(users)
      .set({
        deletedAt: new Date(),
        status: 'DELETED',
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .execute();

    // Invalidate any active sessions for this user
    await deleteUserSessions(id);

    // Audit log
    await logAction(adminUser.id, 'USER_DELETED', 'user', id, {
      softDelete: true,
    });

    return NextResponse.json({
      success: true,
      message: 'Employee account has been deleted.',
    });
  } catch (error: unknown) {
    console.error('Error deleting user:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
