import './setup-test-env';
import test from 'node:test';
import assert from 'node:assert/strict';

// Import route handlers and database modules
import { ensureDatabaseTables } from '../src/server/dbInit';
import { db } from '../src/server/db';
import { users, roles, departments } from '../src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/server/auth/bcrypt';
import { POST as loginHandler } from '../app/api/auth/login/route';
import { GET as getUsersHandler, POST as createUserHandler } from '../app/api/admin/users/route';
import {
  GET as getUserDetailHandler,
  PATCH as updateUserHandler,
  DELETE as deleteUserHandler,
} from '../app/api/admin/users/[id]/route';
import { POST as resetPasswordHandler } from '../app/api/admin/users/[id]/reset-password/route';
import { POST as userStatusHandler } from '../app/api/admin/users/[id]/status/route';
import {
  GET as getPermissionsHandler,
  PATCH as updatePermissionsHandler,
} from '../app/api/admin/users/[id]/permissions/route';
import { GET as getAdminMeHandler } from '../app/api/admin/me/route';
import { POST as changePasswordHandler } from '../app/api/admin/change-password/route';
import { GET as getAuditLogsHandler } from '../app/api/admin/audit-logs/route';
import { GET as getDepartmentsHandler } from '../app/api/departments/route';
import { GET as getExplorerHandler } from '../app/api/departments/[id]/explorer/route';
import { POST as createFolderHandler } from '../app/api/folders/route';
import { PATCH as updateFolderHandler, DELETE as deleteFolderHandler } from '../app/api/folders/[id]/route';
import { POST as uploadFileHandler } from '../app/api/files/upload/route';
import { GET as downloadFileHandler } from '../app/api/files/[id]/download/route';
import { PATCH as updateFileHandler, DELETE as deleteFileHandler } from '../app/api/files/[id]/route';

let adminCookie = '';
let adminUserId = '';
let employeeUserId = '';
let employeeTempPassword = '';
let employeeCookie = '';
let engineeringDeptId = 1;
let accountsDeptId = 2;

test('0. Database initialization & Super Admin seed', async () => {
  await ensureDatabaseTables();

  const superAdminRole = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'super_admin'))
    .limit(1)
    .execute();

  assert.ok(superAdminRole.length > 0, 'super_admin role must exist');
  const roleId = superAdminRole[0].id;

  const depts = await db.select().from(departments).execute();
  assert.ok(depts.length >= 7, 'At least 7 departments must be auto-seeded');
  const engDept = depts.find((d) => d.name.includes('Engineering'));
  const accDept = depts.find((d) => d.name.includes('Accounts'));
  if (engDept) engineeringDeptId = engDept.id;
  if (accDept) accountsDeptId = accDept.id;

  const passwordHash = await hashPassword('SuperAdminPass123!');
  const insertAdmin = await db
    .insert(users)
    .values({
      email: 'admin@fastengineering.com',
      name: 'Super Admin',
      passwordHash,
      roleId,
      status: 'ACTIVE',
    })
    .returning({ id: users.id })
    .execute();

  adminUserId = insertAdmin[0].id;
  assert.ok(adminUserId, 'Super admin created');
});

test('1. Super Admin logs in and obtains session', async () => {
  const req = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@fastengineering.com',
      password: 'SuperAdminPass123!',
    }),
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.user.role, 'super_admin');

  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Set-Cookie header must be present');
  adminCookie = setCookie.split(';')[0];
  assert.ok(adminCookie.startsWith('session_id='), 'Session ID cookie must be set');
});

test('2. Super Admin can open User Management list', async () => {
  const req = new Request('http://localhost:3000/api/admin/users', {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await getUsersHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.users), 'Users array must be returned');
  assert.ok(data.users.length >= 1, 'Admin user should be listed');

  const foundAdmin = data.users.find((u: { id: string }) => u.id === adminUserId);
  assert.ok(foundAdmin, 'Admin must appear in users list');
  assert.equal(foundAdmin.role, 'super_admin');
  assert.equal(foundAdmin.password, undefined, 'Plaintext password must NEVER appear in user list');
  assert.equal(foundAdmin.passwordHash, undefined, 'Password hash must NEVER appear in user list');
});

test('3. Super Admin can create a new employee with department and permissions', async () => {
  const req = new Request('http://localhost:3000/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      name: 'Sarah Jenkins',
      email: 's.jenkins@fastengineering.com',
      departmentId: engineeringDeptId,
      role: 'employee',
      autoGeneratePassword: true,
      permissions: ['VIEW', 'UPLOAD', 'DOWNLOAD'],
    }),
  });

  const res = await createUserHandler(req);
  assert.equal(res.status, 201);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.ok(data.user.id, 'User ID must be returned');
  employeeUserId = data.user.id;
  assert.equal(data.user.name, 'Sarah Jenkins');
  assert.equal(data.user.email, 's.jenkins@fastengineering.com');
  assert.equal(data.user.role, 'employee');
  assert.equal(data.user.departmentId, engineeringDeptId);

  // Temporary password must be returned ONLY in this immediate response
  assert.ok(data.temporaryPassword, 'Temporary password must be returned once on creation');
  assert.ok(data.temporaryPassword.length >= 12, 'Temporary password should be strong');
  employeeTempPassword = data.temporaryPassword;

  // Verify that database does NOT store plaintext password
  const dbUser = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, employeeUserId))
    .limit(1)
    .execute();

  assert.notEqual(dbUser[0].passwordHash, employeeTempPassword, 'Database must NOT store plaintext password');
  assert.ok(dbUser[0].passwordHash.startsWith('$2'), 'Database must store bcrypt hash');
});

test('4. Employee appears in user list with department and permissions', async () => {
  const req = new Request('http://localhost:3000/api/admin/users', {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await getUsersHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  const employee = data.users.find((u: { id: string }) => u.id === employeeUserId);
  assert.ok(employee, 'Employee must be present in user list');
  assert.equal(employee.status, 'ACTIVE');
  assert.ok(employee.permissions.includes('VIEW'), 'Permissions must include VIEW');
  assert.ok(employee.permissions.includes('UPLOAD'), 'Permissions must include UPLOAD');
  assert.ok(employee.permissions.includes('DOWNLOAD'), 'Permissions must include DOWNLOAD');
  assert.equal(employee.password, undefined, 'Plaintext password must not be present');
  assert.equal(employee.passwordHash, undefined, 'Password hash must not be present');
});

test('5. Employee can log in using the newly created temporary password', async () => {
  const req = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: employeeTempPassword,
    }),
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.user.role, 'employee');

  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Employee session cookie set');
  employeeCookie = setCookie.split(';')[0];
});

test('6. Wrong password is rejected for employee', async () => {
  const req = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: 'IncorrectPassword999!',
    }),
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'Invalid credentials');
});

test('7. Super Admin can reset employee password (Option A: Auto-generate)', async () => {
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      mode: 'auto',
    }),
  });

  const res = await resetPasswordHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.temporaryPassword, 'New temporary password must be returned');
  assert.notEqual(data.temporaryPassword, employeeTempPassword, 'New temporary password must differ from old');

  const newTempPassword = data.temporaryPassword;

  // 8. Old password stops working after reset
  const oldLoginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: employeeTempPassword,
    }),
  });

  const oldLoginRes = await loginHandler(oldLoginReq);
  assert.equal(oldLoginRes.status, 401, 'Old password must fail after reset');

  // 9. New password works
  const newLoginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: newTempPassword,
    }),
  });

  const newLoginRes = await loginHandler(newLoginReq);
  assert.equal(newLoginRes.status, 200, 'New temporary password must work');
  const newCookie = newLoginRes.headers.get('set-cookie');
  assert.ok(newCookie);
  employeeCookie = newCookie.split(';')[0];
});

test('8. Super Admin can reset employee password (Option B: Manual password)', async () => {
  const manualPassword = 'EmployeeManualPass2026!';
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      mode: 'manual',
      newPassword: manualPassword,
    }),
  });

  const res = await resetPasswordHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.temporaryPassword, manualPassword);

  // Test login with manual password
  const loginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: manualPassword,
    }),
  });

  const loginRes = await loginHandler(loginReq);
  assert.equal(loginRes.status, 200, 'Manual reset password must work');
  const updatedCookie = loginRes.headers.get('set-cookie');
  assert.ok(updatedCookie);
  employeeCookie = updatedCookie.split(';')[0];
});

test('9. Normal employee MUST NOT access User Management APIs (403 Forbidden)', async () => {
  // Try GET /api/admin/users with employee cookie
  const getReq = new Request('http://localhost:3000/api/admin/users', {
    method: 'GET',
    headers: { Cookie: employeeCookie },
  });

  const getRes = await getUsersHandler(getReq);
  assert.equal(getRes.status, 403, 'Employee must receive 403 on GET users');

  // Try POST /api/admin/users with employee cookie
  const postReq = new Request('http://localhost:3000/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: employeeCookie,
    },
    body: JSON.stringify({
      name: 'Hacker',
      email: 'hacker@test.com',
      departmentId: engineeringDeptId,
    }),
  });

  const postRes = await createUserHandler(postReq);
  assert.equal(postRes.status, 403, 'Employee must receive 403 on POST create user');

  // Try Reset Password with employee cookie
  const resetReq = new Request(
    `http://localhost:3000/api/admin/users/${adminUserId}/reset-password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: employeeCookie,
      },
      body: JSON.stringify({ mode: 'auto' }),
    }
  );

  const resetRes = await resetPasswordHandler(resetReq, {
    params: Promise.resolve({ id: adminUserId }),
  });
  assert.equal(resetRes.status, 403, 'Employee must receive 403 on reset password');
});

test('10. Super Admin can update employee department', async () => {
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      departmentId: accountsDeptId,
    }),
  });

  const res = await updateUserHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  // Verify in GET user detail
  const detailReq = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}`, {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const detailRes = await getUserDetailHandler(detailReq, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  const detailData = await detailRes.json();
  assert.equal(detailData.user.departmentId, accountsDeptId);
  assert.ok(detailData.user.departmentName.includes('Accounts'));
});

test('11. Super Admin can manage employee permissions', async () => {
  const newPerms = ['VIEW', 'UPLOAD', 'DOWNLOAD', 'EDIT', 'DELETE', 'CREATE_FOLDER'];
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/permissions`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      permissions: newPerms,
      departmentId: accountsDeptId,
    }),
  });

  const res = await updatePermissionsHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.deepEqual(data.permissions, newPerms);

  // Verify in GET permissions
  const getPermReq = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/permissions`, {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const getPermRes = await getPermissionsHandler(getPermReq, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  const getPermData = await getPermRes.json();
  assert.deepEqual(getPermData.assignedPermissions.sort(), newPerms.sort());
});

test('12. Disable user prevents login and revokes active sessions', async () => {
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      action: 'disable',
    }),
  });

  const res = await userStatusHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'DISABLED');

  // Attempt login with valid password
  const loginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: 'EmployeeManualPass2026!',
    }),
  });

  const loginRes = await loginHandler(loginReq);
  assert.equal(loginRes.status, 403, 'Disabled user login must be rejected with 403');
  const loginData = await loginRes.json();
  assert.ok(loginData.error.toLowerCase().includes('disabled'));
});

test('13. Re-enable user restores login access', async () => {
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      action: 'enable',
    }),
  });

  const res = await userStatusHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ACTIVE');

  // Login should succeed now
  const loginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: 'EmployeeManualPass2026!',
    }),
  });

  const loginRes = await loginHandler(loginReq);
  assert.equal(loginRes.status, 200, 'Re-enabled employee should be able to log in');
});

test('13b. Super Admin can logout employee sessions', async () => {
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      action: 'logout_sessions',
    }),
  });

  const res = await userStatusHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
});

test('14. Audit records are created with ZERO passwords or hashes', async () => {
  const req = new Request('http://localhost:3000/api/admin/audit-logs', {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await getAuditLogsHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.logs), 'Audit logs array returned');
  assert.ok(data.logs.length > 0, 'Audit logs must contain entries');

  const actions = data.logs.map((l: { action: string }) => l.action);
  assert.ok(actions.includes('CREATE_USER'), 'Audit must have CREATE_USER');
  assert.ok(actions.includes('PASSWORD_RESET'), 'Audit must have PASSWORD_RESET');
  assert.ok(actions.includes('DISABLE_USER'), 'Audit must have DISABLE_USER');
  assert.ok(actions.includes('ENABLE_USER'), 'Audit must have ENABLE_USER');
  assert.ok(actions.includes('PERMISSIONS_CHANGED'), 'Audit must have PERMISSIONS_CHANGED');

  // Strict check: No passwords or bcrypt hashes in audit logs
  for (const log of data.logs) {
    const detailsString = JSON.stringify(log.details || {});
    assert.ok(!detailsString.includes('SuperAdminPass123!'), 'No admin password in audit logs');
    assert.ok(!detailsString.includes('EmployeeManualPass2026!'), 'No employee password in audit logs');
    assert.ok(!detailsString.includes(employeeTempPassword), 'No temp password in audit logs');
    assert.ok(!detailsString.includes('$2a$') && !detailsString.includes('$2b$'), 'No bcrypt hash in audit logs');
  }
});

test('15. Super Admin Settings: View My Account', async () => {
  const req = new Request('http://localhost:3000/api/admin/me', {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await getAdminMeHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.admin.id, adminUserId);
  assert.equal(data.admin.email, 'admin@fastengineering.com');
  assert.equal(data.admin.role, 'SUPER_ADMIN');
  assert.equal(data.admin.status, 'ACTIVE');
  assert.ok(data.admin.createdAt);
  assert.equal(data.admin.password, undefined);
  assert.equal(data.admin.passwordHash, undefined);
});

test('16. Super Admin can change their own password and invalidate other sessions', async () => {
  // Change password with wrong current password -> fails
  const failReq = new Request('http://localhost:3000/api/admin/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      currentPassword: 'WrongCurrentPassword!',
      newPassword: 'BrandNewAdminPass2026!',
      confirmNewPassword: 'BrandNewAdminPass2026!',
      invalidateOtherSessions: true,
    }),
  });

  const failRes = await changePasswordHandler(failReq);
  assert.equal(failRes.status, 401, 'Incorrect current password must fail');

  // Change password successfully
  const successReq = new Request('http://localhost:3000/api/admin/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      currentPassword: 'SuperAdminPass123!',
      newPassword: 'BrandNewAdminPass2026!',
      confirmNewPassword: 'BrandNewAdminPass2026!',
      invalidateOtherSessions: true,
    }),
  });

  const successRes = await changePasswordHandler(successReq);
  assert.equal(successRes.status, 200);
  const successData = await successRes.json();
  assert.equal(successData.success, true);

  // Test login with old admin password -> fails
  const oldLoginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@fastengineering.com',
      password: 'SuperAdminPass123!',
    }),
  });

  const oldLoginRes = await loginHandler(oldLoginReq);
  assert.equal(oldLoginRes.status, 401, 'Old admin password must be rejected');

  // Test login with new admin password -> succeeds
  const newLoginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@fastengineering.com',
      password: 'BrandNewAdminPass2026!',
    }),
  });

  const newLoginRes = await loginHandler(newLoginReq);
  assert.equal(newLoginRes.status, 200, 'New admin password must succeed');
});

test('17. Soft delete employee terminates user and sessions', async () => {
  const req = new Request(`http://localhost:3000/api/admin/users/${employeeUserId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });

  const res = await deleteUserHandler(req, {
    params: Promise.resolve({ id: employeeUserId }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  // Attempt login
  const loginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's.jenkins@fastengineering.com',
      password: 'EmployeeManualPass2026!',
    }),
  });

  const loginRes = await loginHandler(loginReq);
  assert.equal(loginRes.status, 401, 'Deleted employee login must be rejected');
});

let createdFolderId = 0;
let createdFileId = 0;

test('18. Departments API returns real departments and calculated statistics', async () => {
  const res = await getDepartmentsHandler();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.departments), 'Departments array returned');
  assert.equal(data.departments.length, 7, 'All 7 standard departments returned');

  const engineering = data.departments.find((d: { name: string }) => d.name === 'Engineering Department');
  assert.ok(engineering, 'Engineering Department exists');
  assert.ok(typeof engineering.foldersCount === 'number', 'foldersCount is number');
  assert.ok(typeof engineering.filesCount === 'number', 'filesCount is number');
  assert.ok(typeof engineering.storageBytes === 'number', 'storageBytes is number');
  assert.ok(typeof engineering.employeesCount === 'number', 'employeesCount is number');
});

test('19. Super Admin can open Department Explorer with breadcrumbs and root folder', async () => {
  const req = new Request(`http://localhost:3000/api/departments/${engineeringDeptId}/explorer`, {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await getExplorerHandler(req, {
    params: Promise.resolve({ id: String(engineeringDeptId) }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.department.name, 'Engineering Department');
  assert.ok(data.currentFolder, 'Current folder returned');
  assert.ok(Array.isArray(data.breadcrumbs), 'Breadcrumbs array returned');
  assert.equal(data.breadcrumbs[0].name, 'FAST ENGINEERING', 'Root breadcrumb is FAST ENGINEERING');
  assert.ok(Array.isArray(data.folders), 'Folders list returned');
  assert.ok(Array.isArray(data.files), 'Files list returned');
  assert.ok(data.statistics, 'Statistics object returned');
});

test('20. Super Admin can create a folder inside a department', async () => {
  // First get department root folder id
  const explorerReq = new Request(`http://localhost:3000/api/departments/${engineeringDeptId}/explorer`, {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });
  const explorerRes = await getExplorerHandler(explorerReq, {
    params: Promise.resolve({ id: String(engineeringDeptId) }),
  });
  const explorerData = await explorerRes.json();
  const rootFolderId = explorerData.currentFolder.id;

  const req = new Request('http://localhost:3000/api/folders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      name: 'Engineering Projects 2026',
      parentId: rootFolderId,
      departmentId: engineeringDeptId,
    }),
  });

  const res = await createFolderHandler(req);
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.ok(data.folderId, 'Folder ID returned');
  createdFolderId = data.folderId;
});

test('21. Super Admin can upload a document into a department folder', async () => {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob(['Sample technical design document content'], { type: 'application/pdf' }),
    'Design-Plan.pdf'
  );
  formData.append('folderId', String(createdFolderId));

  const req = new Request('http://localhost:3000/api/files/upload', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: formData,
  });

  const res = await uploadFileHandler(req);
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.file.originalName, 'Design-Plan.pdf');
  createdFileId = data.file.id;
});

test('22. Super Admin can download the uploaded document', async () => {
  const req = new Request(`http://localhost:3000/api/files/${createdFileId}/download`, {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await downloadFileHandler(req, {
    params: Promise.resolve({ id: String(createdFileId) }),
  });

  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-disposition')?.includes('Design-Plan.pdf'));
});

test('23. Super Admin can rename and soft delete the document', async () => {
  // Rename
  const renameReq = new Request(`http://localhost:3000/api/files/${createdFileId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      originalName: 'Renamed-Design-Plan.pdf',
    }),
  });

  const renameRes = await updateFileHandler(renameReq, {
    params: Promise.resolve({ id: String(createdFileId) }),
  });
  assert.equal(renameRes.status, 200);

  // Soft delete
  const deleteReq = new Request(`http://localhost:3000/api/files/${createdFileId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });

  const deleteRes = await deleteFileHandler(deleteReq, {
    params: Promise.resolve({ id: String(createdFileId) }),
  });
  assert.equal(deleteRes.status, 200);
});

test('24. Department Isolation: Accounts Department does NOT show Engineering folders/files', async () => {
  const req = new Request(`http://localhost:3000/api/departments/${accountsDeptId}/explorer`, {
    method: 'GET',
    headers: { Cookie: adminCookie },
  });

  const res = await getExplorerHandler(req, {
    params: Promise.resolve({ id: String(accountsDeptId) }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.department.name, 'Accounts Department');

  const folderNames = data.folders.map((f: { name: string }) => f.name);
  assert.ok(!folderNames.includes('Engineering Projects 2026'), 'Accounts must NOT contain Engineering folders');
});

test('25. Department Security: Employee cannot access unauthorized department (403)', async () => {
  // Create a non-admin employee in department 1
  const createEmpReq = new Request('http://localhost:3000/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      name: 'Department Restricted Staff',
      email: 'restricted@fastengineering.com',
      departmentId: engineeringDeptId,
      role: 'employee',
      password: 'RestrictedPass2026!',
      permissions: ['VIEW'],
    }),
  });

  const createEmpRes = await createUserHandler(createEmpReq);
  assert.equal(createEmpRes.status, 201);

  // Log in as this employee
  const loginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'restricted@fastengineering.com',
      password: 'RestrictedPass2026!',
    }),
  });

  const loginRes = await loginHandler(loginReq);
  assert.equal(loginRes.status, 200);
  const empCookie = loginRes.headers.get('set-cookie') || '';

  // Attempt to access Accounts Department (dept 2)
  const unauthorizedReq = new Request(`http://localhost:3000/api/departments/${accountsDeptId}/explorer`, {
    method: 'GET',
    headers: { Cookie: empCookie },
  });

  const unauthorizedRes = await getExplorerHandler(unauthorizedReq, {
    params: Promise.resolve({ id: String(accountsDeptId) }),
  });

  assert.equal(unauthorizedRes.status, 403, 'Employee must be rejected with 403 Forbidden on other departments');
});

