'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Department {
  id: number;
  name: string;
}

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  departmentId: number | null;
}

interface Stats {
  departmentsCount: number;
  foldersCount: number;
  filesCount: number;
  usersCount: number;
  activeEmployeesCount: number;
  inactiveEmployeesCount: number;
  auditLogsCount: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  roleId: number | null;
  role: string;
  departmentId: number | null;
  departmentName: string;
  status: 'ACTIVE' | 'DISABLED' | 'DELETED';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  deletedAt: string | null;
  permissions: string[];
}

interface AuditLogItem {
  id: number;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

// Grouped Permissions for clear human-readable assignment
const PERMISSION_GROUPS = [
  {
    category: 'Documents',
    description: 'Document lifecycle and content operations',
    permissions: [
      { id: 'VIEW', label: 'View', desc: 'Can view authorized documents in assigned department' },
      { id: 'UPLOAD', label: 'Upload', desc: 'Can upload new documents into department folders' },
      { id: 'DOWNLOAD', label: 'Download', desc: 'Can download documents for local use' },
      { id: 'EDIT', label: 'Edit', desc: 'Can rename and edit authorized records' },
      { id: 'DELETE', label: 'Delete', desc: 'Can move authorized records to trash' },
    ],
  },
  {
    category: 'Folders',
    description: 'Directory structure and movement permissions',
    permissions: [
      { id: 'CREATE_FOLDER', label: 'Create Folder', desc: 'Can create subfolders within department' },
      { id: 'MOVE', label: 'Move', desc: 'Can relocate documents and folders' },
    ],
  },
  {
    category: 'Administration',
    description: 'Elevated departmental administrative rights',
    permissions: [
      { id: 'MANAGE_USERS', label: 'Manage Users', desc: 'Can view and coordinate department staff' },
      { id: 'MANAGE_PERMISSIONS', label: 'Manage Permissions', desc: 'Can configure RBAC permissions' },
    ],
  },
];

const STANDARD_EMPLOYEE_PERMISSIONS = ['VIEW', 'UPLOAD', 'DOWNLOAD'];
const MANAGER_PERMISSIONS = ['VIEW', 'UPLOAD', 'DOWNLOAD', 'EDIT', 'DELETE', 'CREATE_FOLDER', 'MOVE'];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'departments' | 'employees' | 'folders' | 'permissions' | 'audit' | 'trash' | 'settings'
  >('dashboard');

  const [stats, setStats] = useState<Stats>({
    departmentsCount: 7,
    foldersCount: 1,
    filesCount: 0,
    usersCount: 1,
    activeEmployeesCount: 1,
    inactiveEmployeesCount: 0,
    auditLogsCount: 0,
  });

  const [departments, setDepartments] = useState<Department[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<number | undefined>(undefined);
  const [folderLoading, setFolderLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Users Management State
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState<UserItem | null>(null);
  const [showEditModal, setShowEditModal] = useState<UserItem | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState<UserItem | null>(null);
  const [showResetModal, setShowResetModal] = useState<UserItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    user: UserItem;
    action: 'disable' | 'enable' | 'delete' | 'logout_sessions';
  } | null>(null);

  // Success Screen after Employee Creation
  const [createdSuccessResult, setCreatedSuccessResult] = useState<{
    userName: string;
    userEmail: string;
    departmentName: string;
    roleName: string;
    temporaryPassword: string;
  } | null>(null);

  // One-time Temporary Password Display State (for Resets)
  const [resetSuccessResult, setResetSuccessResult] = useState<{
    userName: string;
    userEmail: string;
    temporaryPassword: string;
  } | null>(null);

  const [copiedNotification, setCopiedNotification] = useState(false);

  // Password visibility eye toggle states
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showAdminCurrentPassword, setShowAdminCurrentPassword] = useState(false);
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);

  // Create User Form State
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    departmentId: 1,
    role: 'employee',
    autoGeneratePassword: true,
    password: '',
    confirmPassword: '',
    permissions: STANDARD_EMPLOYEE_PERMISSIONS,
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Edit User Form State
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    departmentId: 1,
    role: 'employee',
  });
  const [editLoading, setEditLoading] = useState(false);

  // Permissions Form State
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);

  // Reset Password Form State
  const [resetMode, setResetMode] = useState<'auto' | 'manual'>('auto');
  const [resetManualPassword, setResetManualPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Super Admin Settings State
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [adminProfileLoading, setAdminProfileLoading] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
    invalidateOtherSessions: true,
  });
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // Audit Logs State
  const [auditLogsList, setAuditLogsList] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Generate random strong password helper
  const generateStrongPasswordHelper = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < 14; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  // Load Users Function
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (departmentFilter !== 'all') params.set('departmentId', departmentFilter);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, [searchQuery, departmentFilter, roleFilter, statusFilter]);

  // Load Admin Profile Function
  const loadAdminProfile = useCallback(async () => {
    setAdminProfileLoading(true);
    try {
      const res = await fetch('/api/admin/me');
      if (res.ok) {
        const data = await res.json();
        setAdminProfile(data.admin || null);
      }
    } catch (err) {
      console.error('Error fetching admin profile:', err);
    } finally {
      setAdminProfileLoading(false);
    }
  }, []);

  // Load Audit Logs Function
  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/admin/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogsList(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // Load General Stats, Departments, Folders
  const loadOverviewData = useCallback(async () => {
    try {
      const [statsRes, deptsRes, foldersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/departments'),
        fetch('/api/folders'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (deptsRes.ok) {
        const data = await deptsRes.json();
        setDepartments(data.departments || []);
      }
      if (foldersRes.ok) {
        const data = await foldersRes.json();
        setFolders(data.folders || []);
      }
    } catch (err) {
      console.error('Error fetching admin overview:', err);
    }
  }, []);

  // Synchronize on mount and tab switches
  useEffect(() => {
    const init = async () => {
      await loadOverviewData();
      await loadUsers();
      await loadAdminProfile();
      await loadAuditLogs();
    };
    init();
  }, [loadOverviewData, loadUsers, loadAdminProfile, loadAuditLogs]);

  // Copy to clipboard helper
  const handleCopyPassword = async (pwd: string) => {
    try {
      await navigator.clipboard.writeText(pwd);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    } catch {
      // Fallback
      setMessage({ type: 'success', text: `Password copied to clipboard!` });
    }
  };

  // Sign out helper
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      router.push('/login');
    }
  };

  // Create Folder Handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFolderLoading(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: selectedParentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create folder');

      setNewFolderName('');
      setSelectedParentId(undefined);
      setMessage({ type: 'success', text: `Folder "${data.folder.name}" created successfully.` });
      await loadOverviewData();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error creating folder' });
    } finally {
      setFolderLoading(false);
    }
  };

  // Create Employee Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!createForm.autoGeneratePassword) {
      if (!createForm.password || createForm.password.length < 8) {
        setMessage({ type: 'error', text: 'Manual password must be at least 8 characters long.' });
        return;
      }
      if (createForm.password !== createForm.confirmPassword) {
        setMessage({ type: 'error', text: 'Manual password and confirmation do not match.' });
        return;
      }
    }

    setCreateLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          departmentId: Number(createForm.departmentId),
          role: createForm.role,
          autoGeneratePassword: createForm.autoGeneratePassword,
          password: createForm.autoGeneratePassword ? undefined : createForm.password,
          permissions: createForm.permissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create employee');

      // Find department name for success screen
      const dept = departments.find((d) => d.id === Number(createForm.departmentId));

      setShowCreateModal(false);
      setCreatedSuccessResult({
        userName: data.user.name,
        userEmail: data.user.email,
        departmentName: dept?.name || `Department #${createForm.departmentId}`,
        roleName: data.user.role.toUpperCase(),
        temporaryPassword: data.temporaryPassword,
      });

      // Reset form
      setCreateForm({
        name: '',
        email: '',
        departmentId: 1,
        role: 'employee',
        autoGeneratePassword: true,
        password: '',
        confirmPassword: '',
        permissions: STANDARD_EMPLOYEE_PERMISSIONS,
      });

      await loadUsers();
      await loadOverviewData();
      await loadAuditLogs();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error creating employee' });
    } finally {
      setCreateLoading(false);
    }
  };

  // Edit Employee Handler
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${showEditModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          departmentId: Number(editForm.departmentId),
          role: editForm.role,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update employee');

      setMessage({ type: 'success', text: `Employee "${editForm.name}" updated successfully.` });
      setShowEditModal(null);
      await loadUsers();
      await loadOverviewData();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error updating employee' });
    } finally {
      setEditLoading(false);
    }
  };

  // Manage Permissions Handler
  const handleSavePermissions = async () => {
    if (!showPermissionsModal) return;
    setPermLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${showPermissionsModal.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: showPermissionsModal.departmentId,
          permissions: selectedPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update permissions');

      setMessage({ type: 'success', text: `Permissions updated for ${showPermissionsModal.name}.` });
      setShowPermissionsModal(null);
      await loadUsers();
      await loadAuditLogs();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error updating permissions' });
    } finally {
      setPermLoading(false);
    }
  };

  // Reset Password Handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetModal) return;

    if (resetMode === 'manual') {
      if (!resetManualPassword || resetManualPassword.length < 8) {
        setMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
        return;
      }
      if (resetManualPassword !== resetConfirmPassword) {
        setMessage({ type: 'error', text: 'Passwords do not match.' });
        return;
      }
    }

    setResetLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${showResetModal.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: resetMode,
          newPassword: resetMode === 'manual' ? resetManualPassword : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      const targetUser = showResetModal;
      setShowResetModal(null);
      setResetManualPassword('');
      setResetConfirmPassword('');

      setResetSuccessResult({
        userName: targetUser.name,
        userEmail: targetUser.email,
        temporaryPassword: data.temporaryPassword,
      });

      await loadAuditLogs();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error resetting password' });
    } finally {
      setResetLoading(false);
    }
  };

  // Confirm Status Actions (Disable, Enable, Delete, Logout Sessions)
  const handleExecuteStatusAction = async () => {
    if (!confirmAction) return;
    const { user, action } = confirmAction;
    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to perform ${action} action`);

      setMessage({ type: 'success', text: data.message || `Action executed successfully.` });
      setConfirmAction(null);
      if (showViewModal?.id === user.id) setShowViewModal(null);
      await loadUsers();
      await loadOverviewData();
      await loadAuditLogs();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' });
    }
  };

  // Super Admin Change Own Password Handler
  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changePasswordForm.newPassword !== changePasswordForm.confirmNewPassword) {
      setMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (changePasswordForm.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    setChangePasswordLoading(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changePasswordForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');

      setMessage({ type: 'success', text: 'Your administrator password has been updated securely.' });
      setChangePasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
        invalidateOtherSessions: true,
      });
      await loadAuditLogs();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error changing password' });
    } finally {
      setChangePasswordLoading(false);
    }
  };

  // Filter normal employees vs super admin for counts
  const normalEmployees = usersList.filter((u) => u.role !== 'super_admin');

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-950 text-slate-100 font-sans">
      {/* ========================================================================= */}
      {/* 1. PROFESSIONAL ADMIN SIDEBAR NAVIGATION                                   */}
      {/* ========================================================================= */}
      <aside className="w-full lg:w-72 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-blue-500/20">
                FES
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-white block leading-tight">
                  FAST ENGINEERING
                </span>
                <span className="text-[11px] text-blue-400 font-semibold tracking-wide uppercase">
                  Enterprise Admin
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">🏠</span>
                <span>Dashboard</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('departments')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'departments'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">🏢</span>
                <span>Departments</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold">7</span>
            </button>

            {/* HIGH VISIBILITY EMPLOYEES TAB */}
            <button
              onClick={() => setActiveTab('employees')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'employees'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">👥</span>
                <span>Employees</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold">
                {stats.usersCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('folders')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'folders'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">📁</span>
                <span>Folders & Documents</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('permissions')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'permissions'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">🔐</span>
                <span>Permissions & Roles</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'audit'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">📋</span>
                <span>Audit Logs</span>
              </div>
              {stats.auditLogsCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold">
                  {stats.auditLogsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('trash')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'trash'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">🗑️</span>
                <span>Trash</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">⚙️</span>
                <span>Settings</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer User Card */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold flex items-center justify-center text-xs">
              SA
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-white truncate">
                {adminProfile?.name || 'Super Administrator'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {adminProfile?.email || 'admin@fastengineering.com'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/dashboard"
              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold text-center transition"
            >
              Portal View &rarr;
            </Link>
            <button
              onClick={handleLogout}
              className="px-2 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-900/40 text-red-300 text-[11px] font-semibold text-center transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN ADMIN WORKSPACE                                                      */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              {activeTab === 'dashboard' && 'Executive Dashboard'}
              {activeTab === 'departments' && 'Corporate Departments'}
              {activeTab === 'employees' && 'Employee Management'}
              {activeTab === 'folders' && 'Folders & Documents'}
              {activeTab === 'permissions' && 'Permissions & Roles'}
              {activeTab === 'audit' && 'Corporate Audit Ledger'}
              {activeTab === 'trash' && 'Trash & File Retention'}
              {activeTab === 'settings' && 'Super Admin Account Settings'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Fast Engineering Secure Cloud Management Architecture
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* OBVIOUS "+ CREATE EMPLOYEE" BUTTON IN TOP HEADER */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
            >
              <span className="text-base leading-none">+</span>
              <span>Create Employee</span>
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {/* Global Alert Notification */}
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl border text-sm flex items-center justify-between shadow-lg ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{message.type === 'success' ? '✓' : '⚠️'}</span>
                <span>{message.text}</span>
              </div>
              <button onClick={() => setMessage(null)} className="text-xs font-bold hover:opacity-75 px-2 py-1">
                ✕
              </button>
            </div>
          )}

          {/* ONE-TIME PASSWORD BANNER FOR RESETS */}
          {resetSuccessResult && (
            <div className="mb-6 p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-200 shadow-xl relative animate-in fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔑</span>
                    <h3 className="font-bold text-base text-white">Temporary Password Generated</h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Employee: <strong className="text-white">{resetSuccessResult.userName}</strong> ({resetSuccessResult.userEmail})
                  </p>
                </div>
                <button
                  onClick={() => setResetSuccessResult(null)}
                  className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 transition"
                >
                  Dismiss
                </button>
              </div>

              <div className="mt-3 p-3 bg-slate-900/90 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="font-mono text-lg tracking-wider text-amber-400 font-bold select-all">
                  {resetSuccessResult.temporaryPassword}
                </div>

                <button
                  onClick={() => handleCopyPassword(resetSuccessResult.temporaryPassword)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-2 shadow"
                >
                  <span>📋</span>
                  <span>{copiedNotification ? 'Copied!' : 'Copy Password'}</span>
                </button>
              </div>

              <div className="mt-2 text-[11px] text-amber-400/90 leading-normal">
                <strong>Notice:</strong> Save this temporary password securely. It will not be shown again.
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DASHBOARD                                                            */}
          {/* ========================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              {/* 12. ADMIN DASHBOARD QUICK ACTIONS */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-white tracking-tight">Quick Actions</h2>
                  <p className="text-xs text-slate-400">Common management workflows for Fast Engineering</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="p-4 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-left transition group"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">👤</div>
                    <div className="font-bold text-white text-sm">Create Employee</div>
                    <div className="text-xs text-slate-400 mt-1">Create a new employee account</div>
                  </button>

                  <button
                    onClick={() => setActiveTab('departments')}
                    className="p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-left transition group"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">🏢</div>
                    <div className="font-bold text-white text-sm">Manage Departments</div>
                    <div className="text-xs text-slate-400 mt-1">Manage company departments</div>
                  </button>

                  <button
                    onClick={() => setActiveTab('folders')}
                    className="p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-left transition group"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">📁</div>
                    <div className="font-bold text-white text-sm">Manage Documents</div>
                    <div className="text-xs text-slate-400 mt-1">Manage folders and documents</div>
                  </button>

                  <button
                    onClick={() => setActiveTab('permissions')}
                    className="p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-left transition group"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">🔐</div>
                    <div className="font-bold text-white text-sm">Roles & Permissions</div>
                    <div className="text-xs text-slate-400 mt-1">Manage access permissions</div>
                  </button>

                  <button
                    onClick={() => setActiveTab('audit')}
                    className="p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-left transition group"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">📋</div>
                    <div className="font-bold text-white text-sm">Audit Logs</div>
                    <div className="text-xs text-slate-400 mt-1">View system activity</div>
                  </button>
                </div>
              </div>

              {/* 13. CLICKABLE DASHBOARD STATISTICS */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div
                  onClick={() => setActiveTab('departments')}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition group shadow-sm"
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Departments</div>
                  <div className="text-3xl font-extrabold text-white mt-1 group-hover:text-blue-400 transition">
                    {stats.departmentsCount}
                  </div>
                  <div className="text-xs text-blue-400 mt-2 flex items-center gap-1 font-medium">
                    <span>7 Standard Units</span>
                    <span>&rarr;</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('folders')}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition group shadow-sm"
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Folders</div>
                  <div className="text-3xl font-extrabold text-white mt-1 group-hover:text-blue-400 transition">
                    {stats.foldersCount}
                  </div>
                  <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1 font-medium">
                    <span>Directory Root</span>
                    <span>&rarr;</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('folders')}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition group shadow-sm"
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stored Files</div>
                  <div className="text-3xl font-extrabold text-white mt-1 group-hover:text-blue-400 transition">
                    {stats.filesCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-2 flex items-center gap-1 font-medium">
                    <span>File Repository</span>
                    <span>&rarr;</span>
                  </div>
                </div>

                {/* EMPLOYEES CARD WITH ACTIVE/INACTIVE BREAKDOWN */}
                <div
                  onClick={() => setActiveTab('employees')}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition group shadow-sm"
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff & Roles</div>
                  <div className="text-3xl font-extrabold text-white mt-1 group-hover:text-blue-400 transition">
                    {stats.usersCount}
                  </div>
                  <div className="text-xs text-purple-400 mt-2 flex items-center gap-2 font-medium">
                    <span className="text-emerald-400">{stats.activeEmployeesCount} Active</span>
                    {stats.inactiveEmployeesCount > 0 && (
                      <span className="text-amber-400">{stats.inactiveEmployeesCount} Inactive</span>
                    )}
                    <span>&rarr;</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('audit')}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition group shadow-sm col-span-2 lg:col-span-1"
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audit Records</div>
                  <div className="text-3xl font-extrabold text-white mt-1 group-hover:text-blue-400 transition">
                    {stats.auditLogsCount}
                  </div>
                  <div className="text-xs text-amber-400 mt-2 flex items-center gap-1 font-medium">
                    <span>Immutable Ledger</span>
                    <span>&rarr;</span>
                  </div>
                </div>
              </div>

              {/* 14. VISUAL DEPARTMENT STRUCTURE */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      FAST ENGINEERING Organization Hierarchy
                    </h2>
                    <p className="text-xs text-slate-400">
                      Standard operational departments and personnel assignments
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('departments')}
                    className="mt-2 sm:mt-0 text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    View All Department Records &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {departments.map((dept, idx) => {
                    const deptEmployees = usersList.filter((u) => u.departmentId === dept.id);
                    return (
                      <div
                        key={dept.id || idx}
                        onClick={() => {
                          setDepartmentFilter(String(dept.id));
                          setActiveTab('employees');
                        }}
                        className="bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/40 rounded-xl p-4 cursor-pointer transition group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 font-bold flex items-center justify-center text-xs">
                            {idx + 1}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            Unit #{idx + 1}
                          </span>
                        </div>
                        <h3 className="font-semibold text-white text-sm group-hover:text-blue-400 transition">
                          {dept.name}
                        </h3>
                        <div className="mt-3 pt-2.5 border-t border-slate-700/40 flex justify-between items-center text-xs text-slate-400">
                          <span>{deptEmployees.length} Staff</span>
                          <span className="text-blue-400 text-[11px] font-medium group-hover:underline">
                            View Staff &rarr;
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Audit Ledger Preview */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-base font-bold text-white">Recent Security Activity</h2>
                  <button
                    onClick={() => setActiveTab('audit')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    Open Full Audit Ledger &rarr;
                  </button>
                </div>
                {auditLogsList.length === 0 ? (
                  <p className="text-xs text-slate-500">No recorded audit actions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {auditLogsList.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[11px]">
                            {log.action}
                          </span>
                          <span className="text-slate-300 font-medium">{log.userName || log.userEmail || 'System'}</span>
                        </div>
                        <span className="text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: 2. EMPLOYEES PAGE (EMPLOYEE MANAGEMENT)                              */}
          {/* ========================================================================= */}
          {activeTab === 'employees' && (
            <div className="space-y-6">
              {/* Header & Obvious + Create Employee Action */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Company Employee Directory</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Assign departments, system roles, granular permissions, and manage user credentials
                  </p>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 shrink-0"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>Create Employee</span>
                </button>
              </div>

              {/* Search & Multi-Attribute Filters */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Search Employee</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Department</label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Role</label>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Employee / Staff</option>
                    <option value="manager">Department Manager</option>
                    <option value="admin">Administrator</option>
                    <option value="super_admin">Super Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="all">All Statuses</option>
                    <option value="ACTIVE">Active Only</option>
                    <option value="DISABLED">Inactive / Disabled</option>
                  </select>
                </div>
              </div>

              {/* 11. EMPTY STATE IF ZERO NORMAL EMPLOYEES */}
              {normalEmployees.length === 0 && !usersLoading ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-sm">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-3xl flex items-center justify-center mx-auto mb-4">
                    👥
                  </div>
                  <h3 className="text-lg font-bold text-white">No Employees Yet</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                    Create your first employee to start managing your company records, department assignments, and permissions.
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-xl shadow-blue-600/30 transition inline-flex items-center gap-2"
                  >
                    <span className="text-lg leading-none">+</span>
                    <span>Create Employee</span>
                  </button>
                </div>
              ) : (
                /* EMPLOYEES TABLE */
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                        <tr>
                          <th className="px-5 py-3.5">Employee</th>
                          <th className="px-5 py-3.5">Email</th>
                          <th className="px-5 py-3.5">Department</th>
                          <th className="px-5 py-3.5">Role</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5">Created</th>
                          <th className="px-5 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {usersList.map((user) => (
                          <tr key={user.id} className="hover:bg-slate-800/40 transition">
                            {/* Employee */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 font-bold flex items-center justify-center text-xs uppercase">
                                  {user.name.slice(0, 2)}
                                </div>
                                <span className="font-semibold text-white text-sm">{user.name}</span>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="px-5 py-4 font-mono text-slate-300">{user.email}</td>

                            {/* Department */}
                            <td className="px-5 py-4">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-medium">
                                {user.departmentName}
                              </span>
                            </td>

                            {/* Role */}
                            <td className="px-5 py-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                                  user.role === 'super_admin'
                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                                    : user.role === 'admin'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                    : user.role === 'manager'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {user.role === 'super_admin' ? 'Super Admin' : user.role}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                  user.status === 'ACTIVE'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : user.status === 'DISABLED'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    user.status === 'ACTIVE'
                                      ? 'bg-emerald-400'
                                      : user.status === 'DISABLED'
                                      ? 'bg-amber-400'
                                      : 'bg-red-400'
                                  }`}
                                />
                                {user.status}
                              </span>
                            </td>

                            {/* Created Date */}
                            <td className="px-5 py-4 text-slate-400">
                              <div>{new Date(user.createdAt).toLocaleDateString()}</div>
                              {user.lastLoginAt && (
                                <div className="text-[10px] text-slate-500">
                                  Login: {new Date(user.lastLoginAt).toLocaleDateString()}
                                </div>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* View */}
                                <button
                                  onClick={() => setShowViewModal(user)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                                >
                                  View
                                </button>

                                {/* Edit */}
                                <button
                                  onClick={() => {
                                    setShowEditModal(user);
                                    setEditForm({
                                      name: user.name,
                                      email: user.email,
                                      departmentId: user.departmentId || 1,
                                      role: user.role,
                                    });
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                                >
                                  Edit
                                </button>

                                {/* Permissions */}
                                <button
                                  onClick={() => {
                                    setShowPermissionsModal(user);
                                    setSelectedPermissions(user.permissions || []);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                                >
                                  Permissions
                                </button>

                                {/* Reset Password */}
                                <button
                                  onClick={() => {
                                    setShowResetModal(user);
                                    setResetMode('auto');
                                    setResetManualPassword('');
                                    setResetConfirmPassword('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold text-xs transition"
                                >
                                  Reset Password
                                </button>

                                {/* Disable / Enable */}
                                {user.role !== 'super_admin' && (
                                  <button
                                    onClick={() =>
                                      setConfirmAction({
                                        user,
                                        action: user.status === 'ACTIVE' ? 'disable' : 'enable',
                                      })
                                    }
                                    className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition ${
                                      user.status === 'ACTIVE'
                                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    }`}
                                  >
                                    {user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DEPARTMENTS                                                          */}
          {/* ========================================================================= */}
          {activeTab === 'departments' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-white">Fast Engineering Divisions</h2>
                <p className="text-xs text-slate-400 mt-1">
                  The 7 core operational departments with strict document isolation
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {departments.map((dept, idx) => {
                  const deptUsers = usersList.filter((u) => u.departmentId === dept.id);
                  return (
                    <div key={dept.id || idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 font-bold flex items-center justify-center text-sm">
                          {idx + 1}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          Operational
                        </span>
                      </div>
                      <h3 className="font-bold text-white text-base">{dept.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">Personnel assigned: {deptUsers.length} employees</p>

                      <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
                        <button
                          onClick={() => {
                            setDepartmentFilter(String(dept.id));
                            setActiveTab('employees');
                          }}
                          className="text-blue-400 hover:text-blue-300 font-semibold"
                        >
                          View Employees &rarr;
                        </button>
                        <button
                          onClick={() => setActiveTab('folders')}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          Browse Files
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: FOLDERS & DOCUMENTS                                                  */}
          {/* ========================================================================= */}
          {activeTab === 'folders' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit shadow-sm">
                <h3 className="text-base font-bold text-white mb-4">Create New Folder</h3>
                <form onSubmit={handleCreateFolder} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Folder Name</label>
                    <input
                      type="text"
                      required
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="e.g. 2026 Q1 Project Reports"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Parent Folder</label>
                    <select
                      value={selectedParentId || ''}
                      onChange={(e) => setSelectedParentId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">FAST ENGINEERING (Root)</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={folderLoading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition"
                  >
                    {folderLoading ? 'Creating...' : '+ Add Folder'}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-white mb-4">Document Directory Tree</h3>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-300 space-y-2">
                  <div className="text-blue-400 font-bold">📁 /FAST ENGINEERING (Root)</div>
                  {departments.map((d) => (
                    <div key={d.id} className="pl-4 text-emerald-400">
                      ├── 🏢 {d.name}
                    </div>
                  ))}
                  {folders.map((f) => (
                    <div key={f.id} className="pl-8 text-slate-300">
                      └── 📁 {f.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: PERMISSIONS & ROLES REFERENCE                                        */}
          {/* ========================================================================= */}
          {activeTab === 'permissions' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-white">Permissions & Roles Matrix</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Understandable corporate RBAC rules enforced by Fast Engineering
                </p>
              </div>

              {/* Roles Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-xs px-2.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold uppercase">
                    Super Admin
                  </span>
                  <h3 className="font-bold text-white text-base mt-2">Unrestricted Authority</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Full access across all 7 departments, user provisioning, role assignments, audit inspection, and trash purging.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-xs px-2.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 font-bold uppercase">
                    Admin
                  </span>
                  <h3 className="font-bold text-white text-base mt-2">Administrator</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Operational administrative control over organizational files, department folders, and assigned staff.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-xs px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold uppercase">
                    Manager
                  </span>
                  <h3 className="font-bold text-white text-base mt-2">Department Manager</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Lead of an individual department. Can view, upload, download, rename, and manage departmental folders.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-xs px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold uppercase">
                    Employee
                  </span>
                  <h3 className="font-bold text-white text-base mt-2">Staff Member</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Least-privileged access. Can view and interact only with authorized documents in their primary assigned division.
                  </p>
                </div>
              </div>

              {/* Grouped Permissions Catalog */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-base font-bold text-white">Permission Catalog & Explanations</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {PERMISSION_GROUPS.map((grp) => (
                    <div key={grp.category} className="space-y-3">
                      <div className="border-b border-slate-800 pb-2">
                        <h4 className="font-bold text-white text-sm">{grp.category}</h4>
                        <p className="text-[11px] text-slate-400">{grp.description}</p>
                      </div>
                      <div className="space-y-2">
                        {grp.permissions.map((p) => (
                          <div key={p.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="font-semibold text-white text-xs">{p.label}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{p.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: AUDIT LOGS                                                           */}
          {/* ========================================================================= */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold text-white">Immutable Corporate Audit Ledger</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Complete trail of user creations, password resets, status changes, and file activity
                  </p>
                </div>
                <button
                  onClick={loadAuditLogs}
                  disabled={auditLoading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-lg border border-slate-700 transition"
                >
                  {auditLoading ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Timestamp</th>
                      <th className="px-5 py-3.5">Actor</th>
                      <th className="px-5 py-3.5">Action</th>
                      <th className="px-5 py-3.5">Entity</th>
                      <th className="px-5 py-3.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {auditLogsList.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-5 py-3.5 font-mono text-slate-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-white">
                          {log.userName || log.userEmail || 'Super Administrator'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[11px]">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">{log.entity}</td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                          {log.details ? JSON.stringify(log.details) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: TRASH                                                                */}
          {/* ========================================================================= */}
          {activeTab === 'trash' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-sm">
              <div className="text-3xl mb-3">🗑️</div>
              <h3 className="text-base font-bold text-white">Trash & Retention Management</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Soft-deleted files, folders, and terminated employee accounts are retained here according to corporate policy.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
                <span>✓</span>
                <span>Trash is currently clear</span>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: 10. SUPER ADMIN SETTINGS & ACCOUNT                                   */}
          {/* ========================================================================= */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* My Account Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-white mb-1">My Account Profile</h3>
                <p className="text-xs text-slate-400 mb-6">Primary Super Administrator account credentials</p>

                {adminProfileLoading ? (
                  <p className="text-xs text-slate-500">Loading profile...</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 pb-4 border-b border-slate-800">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-400 font-extrabold flex items-center justify-center text-xl">
                        SA
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">{adminProfile?.name || 'Super Administrator'}</h4>
                        <p className="text-xs text-slate-400 font-mono">{adminProfile?.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 uppercase font-semibold text-[10px] block">Corporate Role</span>
                        <span className="font-bold text-purple-400">SUPER_ADMIN (Full Authority)</span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase font-semibold text-[10px] block">Account Status</span>
                        <span className="font-bold text-emerald-400">ACTIVE</span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase font-semibold text-[10px] block">Created Date</span>
                        <span className="text-slate-300">
                          {adminProfile?.createdAt ? new Date(adminProfile.createdAt).toLocaleDateString() : 'Initial'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase font-semibold text-[10px] block">Security Level</span>
                        <span className="text-slate-300">12-Round Bcrypt Hashes</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                      <button
                        onClick={() => {
                          if (adminProfile) {
                            setConfirmAction({
                              user: {
                                id: adminProfile.id,
                                name: adminProfile.name,
                                email: adminProfile.email,
                                roleId: 1,
                                role: 'super_admin',
                                departmentId: null,
                                departmentName: 'Executive',
                                status: 'ACTIVE',
                                createdAt: adminProfile.createdAt,
                                updatedAt: adminProfile.createdAt,
                                lastLoginAt: adminProfile.lastLoginAt,
                                deletedAt: null,
                                permissions: [],
                              },
                              action: 'logout_sessions',
                            });
                          }
                        }}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                      >
                        Logout My Other Active Sessions
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Change Password Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-white mb-1">Change Admin Password</h3>
                <p className="text-xs text-slate-400 mb-6">Update your Super Administrator master passcode</p>

                <form onSubmit={handleChangeAdminPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showAdminCurrentPassword ? 'text' : 'password'}
                        required
                        value={changePasswordForm.currentPassword}
                        onChange={(e) =>
                          setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })
                        }
                        placeholder="Enter current password"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminCurrentPassword(!showAdminCurrentPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
                      >
                        {showAdminCurrentPassword ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showAdminNewPassword ? 'text' : 'password'}
                        required
                        value={changePasswordForm.newPassword}
                        onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })}
                        placeholder="At least 8 characters"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminNewPassword(!showAdminNewPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
                      >
                        {showAdminNewPassword ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={changePasswordForm.confirmNewPassword}
                      onChange={(e) =>
                        setChangePasswordForm({ ...changePasswordForm, confirmNewPassword: e.target.value })
                      }
                      placeholder="Re-enter new password"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={changePasswordForm.invalidateOtherSessions}
                      onChange={(e) =>
                        setChangePasswordForm({ ...changePasswordForm, invalidateOtherSessions: e.target.checked })
                      }
                      className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Invalidate all other active admin sessions across devices</span>
                  </label>

                  <button
                    type="submit"
                    disabled={changePasswordLoading}
                    className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-blue-600/20"
                  >
                    {changePasswordLoading ? 'Updating Password...' : 'Update Password'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. CREATE EMPLOYEE FORM MODAL                                             */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">Create New Employee</h3>
                <p className="text-xs text-slate-400">Fill in employee details, credentials, and access rules</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleCreateUser} className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Section 1: Personal Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <span>👤</span> Personal Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address / Username</label>
                    <input
                      type="email"
                      required
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="john@fastengineering.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Department Assignment */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <span>🏢</span> Department Assignment
                </h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Department</label>
                  <select
                    value={createForm.departmentId}
                    onChange={(e) => setCreateForm({ ...createForm, departmentId: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section 3: Role Assignment */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <span>🛡️</span> Role Assignment
                </h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">System Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="employee">Employee / Staff (Standard User)</option>
                    <option value="manager">Department Manager</option>
                    <option value="admin">Administrator</option>
                    <option value="super_admin">Super Administrator</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Standard employees default to least-privileged access. Elevated roles require Super Admin authority.
                  </p>
                </div>
              </div>

              {/* Section 4: Permissions */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                    <span>🔐</span> Departmental Permissions
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, permissions: STANDARD_EMPLOYEE_PERMISSIONS })}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Standard Set
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, permissions: MANAGER_PERMISSIONS })}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Manager Set
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {PERMISSION_GROUPS.map((grp) => (
                    <div key={grp.category} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                      <div className="text-xs font-bold text-white mb-2">{grp.category}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {grp.permissions.map((p) => {
                          const checked = createForm.permissions.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                                checked
                                  ? 'bg-blue-600/10 border-blue-500/40 text-white'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCreateForm({
                                      ...createForm,
                                      permissions: [...createForm.permissions, p.id],
                                    });
                                  } else {
                                    setCreateForm({
                                      ...createForm,
                                      permissions: createForm.permissions.filter((id) => id !== p.id),
                                    });
                                  }
                                }}
                                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                              />
                              <div>
                                <span className="font-semibold block">{p.label}</span>
                                <span className="text-[10px] text-slate-500 block leading-tight">{p.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 5: Login Credentials */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <span>🔑</span> Login Credentials
                </h4>

                <label className="flex items-center gap-2.5 text-xs text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.autoGeneratePassword}
                    onChange={(e) => setCreateForm({ ...createForm, autoGeneratePassword: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold">Auto-Generate Cryptographically Secure Temporary Password</span>
                </label>

                {!createForm.autoGeneratePassword && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Initial Password</label>
                        <div className="relative">
                          <input
                            type={showCreatePassword ? 'text' : 'password'}
                            value={createForm.password}
                            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                            placeholder="At least 8 characters"
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCreatePassword(!showCreatePassword)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                          >
                            {showCreatePassword ? '👁️' : '👁️‍🗨️'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password</label>
                        <input
                          type={showCreatePassword ? 'text' : 'password'}
                          value={createForm.confirmPassword}
                          onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                          placeholder="Re-enter password"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const randomPwd = generateStrongPasswordHelper();
                        setCreateForm({
                          ...createForm,
                          password: randomPwd,
                          confirmPassword: randomPwd,
                        });
                        setShowCreatePassword(true);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 font-semibold rounded-lg text-xs transition"
                    >
                      🎲 Generate Secure Password Now
                    </button>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                  <strong>Security Rule:</strong> The temporary password will be displayed <strong>ONLY ONCE</strong>{' '}
                  immediately after creation. Passwords are saved strictly as 12-round bcrypt hashes and cannot be recovered in plaintext later.
                </div>
              </div>

              {/* Submit / Cancel Footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
                >
                  {createLoading ? 'Creating Employee...' : 'Create Employee Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. AFTER EMPLOYEE CREATION SUCCESS SCREEN MODAL                           */}
      {/* ========================================================================= */}
      {createdSuccessResult && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-2xl flex items-center justify-center mx-auto mb-3">
                ✓
              </div>
              <h3 className="text-lg font-bold text-white">Employee Created Successfully</h3>
              <p className="text-xs text-slate-400 mt-0.5">Account has been provisioned and added to the company roster</p>
            </div>

            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2 text-xs mb-5">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Employee:</span>
                <span className="font-bold text-white">{createdSuccessResult.userName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Email:</span>
                <span className="font-mono text-slate-300">{createdSuccessResult.userEmail}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Department:</span>
                <span className="font-semibold text-blue-400">{createdSuccessResult.departmentName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Role:</span>
                <span className="font-semibold text-purple-400">{createdSuccessResult.roleName}</span>
              </div>
            </div>

            {/* TEMPORARY PASSWORD DISPLAY CARD */}
            <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-xl mb-4">
              <span className="text-[10px] uppercase font-bold text-amber-400 block mb-1">
                Temporary Password
              </span>
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-base font-bold text-amber-300 tracking-wider select-all">
                  {createdSuccessResult.temporaryPassword}
                </div>
                <button
                  onClick={() => handleCopyPassword(createdSuccessResult.temporaryPassword)}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5 shrink-0"
                >
                  <span>📋</span>
                  <span>{copiedNotification ? 'Copied!' : 'Copy Password'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 mb-6 flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <p>
                <strong>Warning:</strong> This password will only be shown now. Make sure you provide it securely to
                the employee.
              </p>
            </div>

            <button
              onClick={() => {
                setCreatedSuccessResult(null);
                setActiveTab('employees');
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-blue-600/30"
            >
              Done & Return to Employee Directory
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. EMPLOYEE DETAILS MODAL                                                 */}
      {/* ========================================================================= */}
      {showViewModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Employee Details</h3>
              <button
                onClick={() => setShowViewModal(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              {/* Account Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[10px] uppercase font-bold text-blue-400">Account</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Name:</span>
                  <span className="font-bold text-white">{showViewModal.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-mono text-slate-300">{showViewModal.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span
                    className={`font-bold ${
                      showViewModal.status === 'ACTIVE' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {showViewModal.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Created:</span>
                  <span className="text-slate-300">{new Date(showViewModal.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Login:</span>
                  <span className="text-slate-300">
                    {showViewModal.lastLoginAt ? new Date(showViewModal.lastLoginAt).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>

              {/* Organization Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[10px] uppercase font-bold text-blue-400">Organization</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Department:</span>
                  <span className="font-semibold text-white">{showViewModal.departmentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Role:</span>
                  <span className="font-semibold text-purple-400 uppercase">{showViewModal.role}</span>
                </div>
              </div>

              {/* Permissions Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[10px] uppercase font-bold text-blue-400">Assigned Permissions</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {showViewModal.permissions && showViewModal.permissions.length > 0 ? (
                    showViewModal.permissions.map((p) => (
                      <span
                        key={p}
                        className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono text-[11px]"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">No explicit permissions assigned</span>
                  )}
                </div>
              </div>

              {/* Account Security Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[10px] uppercase font-bold text-blue-400">Account Security</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => {
                      const user = showViewModal;
                      setShowViewModal(null);
                      setShowResetModal(user);
                      setResetMode('auto');
                    }}
                    className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold rounded-lg text-xs transition text-center"
                  >
                    Reset Password
                  </button>

                  {showViewModal.role !== 'super_admin' && (
                    <button
                      onClick={() => {
                        const user = showViewModal;
                        setConfirmAction({
                          user,
                          action: user.status === 'ACTIVE' ? 'disable' : 'enable',
                        });
                      }}
                      className={`px-3 py-2 rounded-lg font-semibold text-xs border transition text-center ${
                        showViewModal.status === 'ACTIVE'
                          ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {showViewModal.status === 'ACTIVE' ? 'Disable Account' : 'Enable Account'}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      const user = showViewModal;
                      setConfirmAction({
                        user,
                        action: 'logout_sessions',
                      });
                    }}
                    className="col-span-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs border border-slate-700 transition text-center"
                  >
                    Logout Other Sessions
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-right">
              <button
                onClick={() => setShowViewModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. RESET EMPLOYEE PASSWORD MODAL                                          */}
      {/* ========================================================================= */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Reset Employee Password</h3>
                <p className="text-xs text-slate-400">
                  {showResetModal.name} ({showResetModal.email})
                </p>
              </div>
              <button
                onClick={() => setShowResetModal(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* Option Selector */}
              <div className="space-y-2">
                <label
                  onClick={() => setResetMode('auto')}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                    resetMode === 'auto'
                      ? 'bg-blue-600/10 border-blue-500/50 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === 'auto'}
                    onChange={() => setResetMode('auto')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold block">Option 1: Generate Secure Temporary Password</span>
                    <span className="text-[11px] text-slate-500 block">
                      Generates a cryptographically strong 14-character password
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setResetMode('manual')}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                    resetMode === 'manual'
                      ? 'bg-blue-600/10 border-blue-500/50 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === 'manual'}
                    onChange={() => setResetMode('manual')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold block">Option 2: Set New Password Manually</span>
                    <span className="text-[11px] text-slate-500 block">Specify custom initial password</span>
                  </div>
                </label>
              </div>

              {resetMode === 'manual' && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        value={resetManualPassword}
                        onChange={(e) => setResetManualPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                      >
                        {showResetPassword ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm New Password</label>
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-[11px] leading-relaxed">
                <strong>Notice:</strong> Resetting this password will immediately invalidate all existing sessions of this employee.
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition shadow"
                >
                  {resetLoading ? 'Resetting...' : 'Reset Employee Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT EMPLOYEE MODAL                                                       */}
      {/* ========================================================================= */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white">Edit Employee Information</h3>
              <button
                onClick={() => setShowEditModal(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                <select
                  value={editForm.departmentId}
                  onChange={(e) => setEditForm({ ...editForm, departmentId: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                >
                  <option value="employee">Employee / Staff</option>
                  <option value="manager">Department Manager</option>
                  <option value="admin">Administrator</option>
                  <option value="super_admin">Super Administrator</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANAGE PERMISSIONS MODAL                                                  */}
      {/* ========================================================================= */}
      {showPermissionsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white">Manage Permissions</h3>
                <p className="text-xs text-slate-400">
                  {showPermissionsModal.name} — {showPermissionsModal.departmentName}
                </p>
              </div>
              <button
                onClick={() => setShowPermissionsModal(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="font-semibold text-slate-300">Grant or revoke permissions:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPermissions(MANAGER_PERMISSIONS)}
                    className="text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedPermissions([])}
                    className="text-slate-400 hover:text-white"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {PERMISSION_GROUPS.map((grp) => (
                <div key={grp.category} className="space-y-2">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    {grp.category}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grp.permissions.map((p) => {
                      const checked = selectedPermissions.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                            checked
                              ? 'bg-blue-600/10 border-blue-500/40 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPermissions([...selectedPermissions, p.id]);
                              } else {
                                setSelectedPermissions(selectedPermissions.filter((id) => id !== p.id));
                              }
                            }}
                            className="mt-0.5 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="font-semibold block">{p.label}</span>
                            <span className="text-[10px] text-slate-500 block leading-tight">{p.desc}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPermissionsModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={permLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow"
              >
                {permLoading ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFIRMATION DIALOG (DISABLE, ENABLE, DELETE, LOGOUT SESSIONS)            */}
      {/* ========================================================================= */}
      {confirmAction && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xl flex items-center justify-center mx-auto mb-3">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-white">
              {confirmAction.action === 'disable' && `Disable ${confirmAction.user.name}?`}
              {confirmAction.action === 'enable' && `Re-enable ${confirmAction.user.name}?`}
              {confirmAction.action === 'delete' && `Delete ${confirmAction.user.name}?`}
              {confirmAction.action === 'logout_sessions' && `Revoke Sessions for ${confirmAction.user.name}?`}
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              {confirmAction.action === 'disable' &&
                'Disabling this account will instantly revoke all active sessions and block the employee from logging in.'}
              {confirmAction.action === 'enable' &&
                'Re-enabling this account will restore the employee’s portal access immediately.'}
              {confirmAction.action === 'delete' &&
                'Soft-deleting this account will terminate active sessions and remove the employee from active directories.'}
              {confirmAction.action === 'logout_sessions' &&
                'This will instantly log out this employee from all devices and browsers.'}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteStatusAction}
                className={`py-2.5 text-white text-xs font-bold rounded-xl transition shadow ${
                  confirmAction.action === 'enable'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
