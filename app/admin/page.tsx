'use client';

import { useState, useEffect } from 'react';
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
  auditLogsCount: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'departments' | 'folders' | 'employees' | 'audit' | 'trash'>('departments');
  const [stats, setStats] = useState<Stats>({
    departmentsCount: 7,
    foldersCount: 1,
    filesCount: 0,
    usersCount: 1,
    auditLogsCount: 0,
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<number | undefined>(undefined);
  const [folderLoading, setFolderLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshFolders = async () => {
    try {
      const foldersRes = await fetch('/api/folders');
      if (foldersRes.ok) {
        const foldersData = await foldersRes.json();
        setFolders(foldersData.folders || []);
      }
      const statsRes = await fetch('/api/admin/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('Error refreshing folders:', err);
    }
  };

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const [statsRes, deptsRes, foldersRes] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/departments'),
          fetch('/api/folders'),
        ]);

        if (!active) return;

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        if (deptsRes.ok) {
          const deptsData = await deptsRes.json();
          setDepartments(deptsData.departments || []);
        }
        if (foldersRes.ok) {
          const foldersData = await foldersRes.json();
          setFolders(foldersData.folders || []);
        }
      } catch (err) {
        console.error('Error loading admin data:', err);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setFolderLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: selectedParentId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create folder');
      }

      setMessage({ type: 'success', text: `Folder "${newFolderName}" created successfully!` });
      setNewFolderName('');
      await refreshFolders();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setMessage({ type: 'error', text: err.message });
      } else {
        setMessage({ type: 'error', text: 'Failed to create folder' });
      }
    } finally {
      setFolderLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xl text-white shadow-md shadow-blue-500/20">
                FES
              </div>
              <div>
                <span className="font-bold text-lg text-white">FAST ENGINEERING</span>
                <span className="ml-2 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                  SUPER ADMIN
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 transition"
            >
              Employee View &rarr;
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-900/50 bg-red-950/30 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase">Departments</div>
            <div className="text-2xl font-bold text-white mt-1">{stats.departmentsCount}</div>
            <div className="text-[11px] text-blue-400 mt-1">7 Standard Units</div>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase">Total Folders</div>
            <div className="text-2xl font-bold text-white mt-1">{stats.foldersCount}</div>
            <div className="text-[11px] text-emerald-400 mt-1">FAST ENGINEERING Root</div>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase">Stored Files</div>
            <div className="text-2xl font-bold text-white mt-1">{stats.filesCount}</div>
            <div className="text-[11px] text-slate-400 mt-1">50MB Max Whitelist</div>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase">Staff & Roles</div>
            <div className="text-2xl font-bold text-white mt-1">{stats.usersCount}</div>
            <div className="text-[11px] text-purple-400 mt-1">RBAC Protected</div>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4 col-span-2 lg:col-span-1">
            <div className="text-xs font-semibold text-slate-400 uppercase">Audit Records</div>
            <div className="text-2xl font-bold text-white mt-1">{stats.auditLogsCount}</div>
            <div className="text-[11px] text-amber-400 mt-1">Immutable Trail</div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-800 gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('departments')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'departments'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🏢 Departments (7)
          </button>
          <button
            onClick={() => setActiveTab('folders')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'folders'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📁 Folder Hierarchy
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'employees'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            👥 Employees & RBAC
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🛡️ Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('trash')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'trash'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🗑️ Trash Management
          </button>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm flex items-center justify-between ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xs font-bold hover:opacity-75">
              ✕
            </button>
          </div>
        )}

        {/* Tab 1: Departments */}
        {activeTab === 'departments' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">Fast Engineering Department Overview</h2>
              <span className="text-xs text-slate-400">All 7 divisions loaded with departmental isolation</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((dept, idx) => (
                <div
                  key={dept.id || idx}
                  className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 hover:border-slate-600 transition"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 font-bold flex items-center justify-center text-sm">
                      {idx + 1}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Operational
                    </span>
                  </div>
                  <h3 className="font-semibold text-white text-base">{dept.name}</h3>
                  <div className="mt-4 pt-3 border-t border-slate-700/40 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Root Node:</span>
                    <span className="font-mono text-slate-300">/FAST ENGINEERING/{dept.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Folder Hierarchy */}
        {activeTab === 'folders' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Create Folder Form */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 h-fit">
              <h3 className="text-base font-bold text-white mb-4">Create New Folder</h3>
              <form onSubmit={handleCreateFolder} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                    Folder Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. 2026 Q1 Project Reports"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                    Parent Folder
                  </label>
                  <select
                    value={selectedParentId || ''}
                    onChange={(e) => setSelectedParentId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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

            {/* Folder Tree View */}
            <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/60 rounded-xl p-6">
              <h3 className="text-base font-bold text-white mb-4">Current Folder Tree</h3>
              <div className="space-y-2">
                <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg flex items-center gap-3">
                  <span className="text-xl">🏢</span>
                  <div>
                    <span className="font-bold text-white text-sm">FAST ENGINEERING</span>
                    <span className="ml-2 text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono">
                      ROOT NODE
                    </span>
                  </div>
                </div>

                {folders.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4">No additional custom folders yet.</p>
                ) : (
                  folders.map((f) => (
                    <div
                      key={f.id}
                      className="ml-6 p-2.5 bg-slate-900/50 border border-slate-700/40 rounded-lg flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span>📁</span>
                        <span className="font-medium text-slate-200">{f.name}</span>
                        {f.parentId && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            (parent #{f.parentId})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">ID: {f.id}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Employees */}
        {activeTab === 'employees' && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-base font-bold text-white">Employee & Role Management</h3>
                <p className="text-xs text-slate-400">Configure department access and granular RBAC permissions</p>
              </div>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-400 uppercase pb-2 border-b border-slate-800">
                <div>Staff Name</div>
                <div>Assigned Department</div>
                <div>Role Authority</div>
                <div>Permissions</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-slate-200 py-3 items-center">
                <div className="font-semibold text-white">Super Administrator</div>
                <div>All 7 Departments</div>
                <div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                    SUPER_ADMIN
                  </span>
                </div>
                <div className="text-xs text-emerald-400 font-mono">ALL PERMISSIONS (11)</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Audit Logs */}
        {activeTab === 'audit' && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-base font-bold text-white">Corporate Audit Log</h3>
                <p className="text-xs text-slate-400">Immutable ledger of all activities across the platform</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
                Retention: Indefinite
              </span>
            </div>
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-700 rounded-lg">
              <span className="text-3xl block mb-2">🛡️</span>
              <p className="text-sm font-medium text-slate-300">Audit trail active and listening</p>
              <p className="text-xs text-slate-500 mt-1">
                All login attempts, folder operations, user changes, and file transactions are recorded.
              </p>
            </div>
          </div>
        )}

        {/* Tab 5: Trash */}
        {activeTab === 'trash' && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-base font-bold text-white">System Trash & Soft-Deleted Items</h3>
                <p className="text-xs text-slate-400">Restore or permanently purge soft-deleted files and folders</p>
              </div>
            </div>
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-700 rounded-lg">
              <span className="text-3xl block mb-2">🗑️</span>
              <p className="text-sm font-medium text-slate-300">Trash is currently empty</p>
              <p className="text-xs text-slate-500 mt-1">Deleted items will be safely held here for recovery.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
