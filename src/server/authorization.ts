import { db } from './db';
import { users, roles, userDepartmentAccess, permissions } from './drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { Permission } from './permissions';
import { getSessionData } from './auth/session';
import { NextResponse } from 'next/server';

/**
 * Check if a user has a specific permission. For SUPER_ADMIN role, all permissions are granted.
 * For department employees, permissions are looked up in `user_department_access` linking users, departments, and permissions.
 */
export async function checkPermission(userId: string, permission: Permission, departmentId?: number): Promise<boolean> {
  // Fetch user with role
  const userRows = await db
    .select({ roleId: users.roleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .execute();
  if (userRows.length === 0) return false;
  const roleId = userRows[0].roleId;

  // SUPER_ADMIN (assuming role with name 'super_admin')
  if (roleId) {
    const roleRows = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1)
      .execute();
    if (roleRows.length && roleRows[0].name === 'super_admin') {
      return true;
    }
  }

  // If departmentId not provided, deny (except super admin handled above)
  if (!departmentId) return false;

  // Check permission mapping
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.name, permission))
    .limit(1)
    .execute();
  if (permRows.length === 0) return false;
  const permId = permRows[0].id;

  const accessRows = await db
    .select()
    .from(userDepartmentAccess)
    .where(
      and(
        eq(userDepartmentAccess.userId, userId),
        eq(userDepartmentAccess.departmentId, departmentId),
        eq(userDepartmentAccess.permissionId, permId)
      )
    )
    .limit(1)
    .execute();

  return accessRows.length > 0;
}

export interface AuthenticatedUser {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name: string;
    roleId: number | null;
    status: string;
    departmentId: number | null;
  };
  role: string;
}

export type AuthenticatedAdmin = AuthenticatedUser;

/**
 * Validates that the request has an active session for any valid authenticated user.
 */
export async function requireAuthUser(
  request: Request
): Promise<{ errorResponse?: NextResponse; auth?: AuthenticatedUser }> {
  const sessionData = await getSessionData(request);
  if (!sessionData) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      ),
    };
  }

  const { user, sessionId } = sessionData;
  let roleName = 'employee';
  if (user.roleId) {
    const roleRows = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1)
      .execute();
    if (roleRows.length > 0) roleName = roleRows[0].name;
  }

  return {
    auth: {
      sessionId,
      user,
      role: roleName,
    },
  };
}

/**
 * Validates that the request has an active session for a SUPER_ADMIN.
 * Returns { user, session, role } if valid, or a NextResponse (401/403) to return immediately.
 */
export async function requireSuperAdmin(
  request: Request
): Promise<{ errorResponse?: NextResponse; auth?: AuthenticatedAdmin }> {
  const authRes = await requireAuthUser(request);
  if (authRes.errorResponse) return authRes;
  const auth = authRes.auth!;

  if (auth.role !== 'super_admin') {
    return {
      errorResponse: NextResponse.json(
        { error: 'Forbidden. Super Admin privileges required.' },
        { status: 403 }
      ),
    };
  }

  return { auth };
}
