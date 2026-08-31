// app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { users, roles, departments, permissions, userDepartmentAccess } from '@/src/server/drizzle/schema';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { hashPassword } from '@/src/server/auth/bcrypt';
import { logAction } from '@/src/server/audit';
import { ensureDatabaseTables } from '@/src/server/dbInit';
import crypto from 'crypto';

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Full name is required').max(255),
  email: z.string().email('Valid email address is required').max(255),
  role: z.string().default('employee'),
  departmentId: z.number().int().positive('Department is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  autoGeneratePassword: z.boolean().optional(),
  permissions: z.array(z.string()).default([]),
});

function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()-_=+';
  const all = upper + lower + digits + symbols;

  let pwd = '';
  pwd += upper[crypto.randomInt(upper.length)];
  pwd += lower[crypto.randomInt(lower.length)];
  pwd += digits[crypto.randomInt(digits.length)];
  pwd += symbols[crypto.randomInt(symbols.length)];

  for (let i = pwd.length; i < length; i++) {
    pwd += all[crypto.randomInt(all.length)];
  }

  // Shuffle
  return pwd.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

export async function GET(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const departmentIdParam = searchParams.get('departmentId');
    const roleParam = searchParams.get('role');
    const statusParam = searchParams.get('status');

    // Query all users
    const queryConditions = [];

    if (search) {
      queryConditions.push(
        or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )
      );
    }

    if (departmentIdParam && departmentIdParam !== 'all') {
      const deptId = parseInt(departmentIdParam, 10);
      if (!isNaN(deptId)) {
        queryConditions.push(eq(users.departmentId, deptId));
      }
    }

    if (statusParam && statusParam !== 'all') {
      queryConditions.push(eq(users.status, statusParam));
    }

    const whereClause = queryConditions.length > 0 ? and(...queryConditions) : undefined;

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
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .execute();

    // Fetch all roles and departments for joining
    const [allRoles, allDepts, allUserPerms] = await Promise.all([
      db.select().from(roles).execute(),
      db.select().from(departments).execute(),
      db
        .select({
          userId: userDepartmentAccess.userId,
          permissionName: permissions.name,
        })
        .from(userDepartmentAccess)
        .leftJoin(permissions, eq(userDepartmentAccess.permissionId, permissions.id))
        .execute(),
    ]);

    const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));
    const deptMap = new Map(allDepts.map((d) => [d.id, d.name]));

    // Map permissions by user
    const permMap = new Map<string, string[]>();
    for (const row of allUserPerms) {
      if (row.userId && row.permissionName) {
        const list = permMap.get(row.userId) || [];
        list.push(row.permissionName);
        permMap.set(row.userId, list);
      }
    }

    // Transform user results
    let formattedUsers = userRows.map((u) => {
      const roleName = u.roleId ? roleMap.get(u.roleId) || 'employee' : 'employee';
      const departmentName = u.departmentId ? deptMap.get(u.departmentId) || 'Unassigned' : 'Unassigned';
      const userPermissions = permMap.get(u.id) || [];

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        roleId: u.roleId,
        role: roleName,
        departmentId: u.departmentId,
        departmentName,
        status: u.status || 'ACTIVE',
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        lastLoginAt: u.lastLoginAt,
        deletedAt: u.deletedAt,
        permissions: userPermissions,
      };
    });

    if (roleParam && roleParam !== 'all') {
      formattedUsers = formattedUsers.filter(
        (u) => u.role.toLowerCase() === roleParam.toLowerCase()
      );
    }

    return NextResponse.json({
      users: formattedUsers,
      total: formattedUsers.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching users list:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const adminUser = authCheck.auth!.user;

    const body = await request.json();
    const parseResult = CreateUserSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Check if email already exists
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email.toLowerCase().trim()))
      .limit(1)
      .execute();

    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: 'A user with this email address already exists.' },
        { status: 409 }
      );
    }

    // Determine role ID
    let roleId: number;
    const targetRoleName = (data.role || 'employee').toLowerCase();
    const existingRole = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, targetRoleName))
      .limit(1)
      .execute();

    if (existingRole.length > 0) {
      roleId = existingRole[0].id;
    } else {
      const insertedRole = await db
        .insert(roles)
        .values({ name: targetRoleName })
        .returning({ id: roles.id })
        .execute();
      roleId = insertedRole[0].id;
    }

    // Password generation / resolution
    let rawPassword = data.password?.trim();
    let wasGenerated = false;

    if (data.autoGeneratePassword || !rawPassword) {
      rawPassword = generateSecurePassword(14);
      wasGenerated = true;
    }

    // Securely hash with bcrypt
    const passwordHash = await hashPassword(rawPassword);

    // Insert user into database
    const insertedUser = await db
      .insert(users)
      .values({
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        passwordHash,
        roleId,
        departmentId: data.departmentId,
        status: 'ACTIVE',
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        departmentId: users.departmentId,
        status: users.status,
        createdAt: users.createdAt,
      })
      .execute();

    const createdUser = insertedUser[0];

    // Assign permissions in user_department_access
    if (data.permissions && data.permissions.length > 0) {
      const allPermRows = await db.select().from(permissions).execute();
      const permMap = new Map(allPermRows.map((p) => [p.name, p.id]));

      const accessInserts: { userId: string; departmentId: number; permissionId: number }[] = [];
      for (const permName of data.permissions) {
        let permId = permMap.get(permName);
        if (!permId) {
          const newPerm = await db
            .insert(permissions)
            .values({ name: permName })
            .returning({ id: permissions.id })
            .execute();
          permId = newPerm[0].id;
          permMap.set(permName, permId);
        }
        accessInserts.push({
          userId: createdUser.id,
          departmentId: data.departmentId,
          permissionId: permId,
        });
      }

      if (accessInserts.length > 0) {
        await db.insert(userDepartmentAccess).values(accessInserts).execute();
      }
    }

    // Audit logging - strictly NO passwords or hashes logged
    await logAction(
      adminUser.id,
      'CREATE_USER',
      'user',
      createdUser.id,
      {
        userName: createdUser.name,
        userEmail: createdUser.email,
        role: targetRoleName,
        departmentId: data.departmentId,
        assignedPermissionsCount: data.permissions.length,
      }
    );

    // Return created user with temporary password ONLY in this immediate response
    return NextResponse.json(
      {
        success: true,
        message: 'Employee account created successfully.',
        user: {
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
          role: targetRoleName,
          departmentId: createdUser.departmentId,
          status: createdUser.status,
          createdAt: createdUser.createdAt,
          permissions: data.permissions,
        },
        temporaryPassword: rawPassword,
        wasGenerated,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating user:', error);
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
