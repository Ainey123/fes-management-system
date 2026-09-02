'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Department {
  id: number;
  name: string;
  foldersCount?: number;
  filesCount?: number;
  storageBytes?: number;
  employeesCount?: number;
}

interface ExplorerFolder {
  id: number;
  name: string;
  createdAt: string;
}

interface ExplorerFile {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  folderId: number | null;
  uploadedBy: string | null;
  uploaderName?: string;
  uploaderEmail?: string;
  uploadedAt: string;
}

interface ExplorerData {
  department: {
    id: number;
    name: string;
  };
  currentFolder: {
    id: number;
    name: string;
    parentId: number | null;
    isRoot: boolean;
  };
  breadcrumbs: Array<{ id: number | null; name: string }>;
  folders: ExplorerFolder[];
  files: ExplorerFile[];
  statistics: {
    foldersCount: number;
    filesCount: number;
    storageBytes: number;
    employeesCount: number;
  };
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: number | null;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) return '🖼️';
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return '🗜️';
  if (['txt', 'md', 'json', 'yaml', 'xml'].includes(ext)) return '📝';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵';
  return '📄';
}

export default function EmployeeDashboardPage() {
  const router = useRouter();

  // User Profile State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Departments State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  // Explorer State
  const [explorerData, setExplorerData] = useState<ExplorerData | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'files' | 'upload'>('files');

  // Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // New Subfolder Modal State
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderLoading, setFolderLoading] = useState(false);

  // File Preview Modal State
  const [previewTarget, setPreviewTarget] = useState<ExplorerFile | null>(null);

  // Feedback Notification Message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Department Explorer Data
  const loadExplorerData = useCallback(
    async (deptId: number, folderId?: number | null, search?: string) => {
      setExplorerLoading(true);
      try {
        const params = new URLSearchParams();
        if (folderId) params.set('folderId', String(folderId));
        if (search?.trim()) params.set('search', search.trim());

        const res = await fetch(`/api/departments/${deptId}/explorer?${params.toString()}`);
        if (res.ok) {
          const data: ExplorerData = await res.json();
          setExplorerData(data);
        } else {
          const errData = await res.json();
          setMessage({
            type: 'error',
            text: errData.error || 'Failed to load department repository.',
          });
        }
      } catch (err) {
        console.error('Error loading explorer:', err);
      } finally {
        setExplorerLoading(false);
      }
    },
    []
  );

  // Initial Authentication & Department Loading
  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const authCheck = await fetch('/api/auth/me');
        if (!authCheck.ok) {
          router.push('/login');
          return;
        }

        const authData = await authCheck.json();
        if (!authData.authenticated || !authData.user) {
          router.push('/login');
          return;
        }

        if (!active) return;
        setCurrentUser(authData.user);

        const deptsRes = await fetch('/api/departments');
        if (deptsRes.ok) {
          const deptsData = await deptsRes.json();
          const deptList: Department[] = deptsData.departments || [];
          setDepartments(deptList);

          if (deptList.length > 0) {
            // Prefer user assigned department, otherwise fall back to first department
            let targetDeptId = deptList[0].id;
            if (authData.user.departmentId) {
              const matched = deptList.find((d) => d.id === authData.user.departmentId);
              if (matched) targetDeptId = matched.id;
            }
            setSelectedDeptId(targetDeptId);
            loadExplorerData(targetDeptId);
          }
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [router, loadExplorerData]);

  // Handle Switch Department Dropdown
  const handleSelectDepartment = (deptId: number) => {
    setSelectedDeptId(deptId);
    setSearchQuery('');
    setActiveTab('files');
    loadExplorerData(deptId);
  };

  // Handle File Upload Form Submission
  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedDeptId || !explorerData?.currentFolder) {
      setMessage({ type: 'error', text: 'Please select a file to upload.' });
      return;
    }

    setUploadLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('folderId', String(explorerData.currentFolder.id));
      formData.append('departmentId', String(selectedDeptId));

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(data.error || 'Failed to upload document');
      }

      setUploadFile(null);
      setActiveTab('files');
      setMessage({
        type: 'success',
        text: `Document "${data.file?.originalName || uploadFile.name}" uploaded successfully.`,
      });
      await loadExplorerData(selectedDeptId, explorerData.currentFolder.id);
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setUploadLoading(false);
    }
  };

  // Handle Create Subfolder Form Submission
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !selectedDeptId || !explorerData?.currentFolder) return;

    setFolderLoading(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: explorerData.currentFolder.id,
          departmentId: selectedDeptId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(data.error || 'Failed to create folder');
      }

      setNewFolderName('');
      setShowFolderModal(false);
      setMessage({
        type: 'success',
        text: `Folder "${newFolderName.trim()}" created successfully.`,
      });
      await loadExplorerData(selectedDeptId, explorerData.currentFolder.id);
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error creating folder',
      });
    } finally {
      setFolderLoading(false);
    }
  };

  // Export Directory as CSV
  const handleExportDirectoryCSV = () => {
    if (!explorerData || explorerData.files.length === 0) return;
    const headers = ['File Name', 'Size (Bytes)', 'Size (Formatted)', 'MIME Type', 'Uploaded By', 'Uploader Email', 'Upload Date'];
    const rows = explorerData.files.map((f) => [
      `"${f.originalName.replace(/"/g, '""')}"`,
      f.size,
      `"${formatBytes(f.size)}"`,
      `"${f.mimeType}"`,
      `"${f.uploaderName || 'Staff'}"`,
      `"${f.uploaderEmail || ''}"`,
      `"${new Date(f.uploadedAt).toISOString()}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentDeptName.replace(/\s+/g, '_')}_Files_Index.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Sign Out
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.push('/login');
  };

  const currentDeptName =
    explorerData?.department.name ||
    departments.find((d) => d.id === selectedDeptId)?.name ||
    'Department Repository';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* ========================================================================= */}
      {/* TOP HEADER BAR                                                            */}
      {/* ========================================================================= */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-blue-500/20">
                FES
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-white block leading-tight">
                  FAST ENGINEERING
                </span>
                <span className="text-[11px] text-blue-400 font-semibold tracking-wide uppercase">
                  Employee Workspace
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 font-bold flex items-center justify-center uppercase text-[10px]">
                  {currentUser.name.slice(0, 2)}
                </div>
                <div>
                  <span className="font-semibold text-white block leading-none">{currentUser.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono capitalize">{currentUser.role}</span>
                </div>
              </div>
            )}

            {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
              <Link
                href="/admin"
                className="text-xs font-semibold text-slate-200 hover:text-white px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1.5"
              >
                <span>⚙️</span>
                <span>Admin Portal</span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-red-300 hover:text-white px-3 py-2 rounded-xl border border-red-900/40 bg-red-950/40 hover:bg-red-900/50 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN WORKSPACE BODY                                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Global Notification Banner */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-xl border text-xs flex items-center justify-between shadow-lg ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{message.type === 'success' ? '✓' : '⚠️'}</span>
              <span>{message.text}</span>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="text-xs font-bold hover:opacity-75 px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Division Selector & Breadcrumb Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/" className="hover:text-slate-200 font-semibold">
              FAST ENGINEERING
            </Link>
            <span>/</span>
            <span className="text-blue-400 font-bold">{currentDeptName}</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Division:
            </label>
            <select
              value={selectedDeptId || ''}
              onChange={(e) => handleSelectDepartment(Number(e.target.value))}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Bar: Search & Sub-Tabs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          {/* Search Box */}
          <div className="w-full sm:w-96 relative">
            <input
              type="text"
              placeholder={`Search files inside ${currentDeptName}...`}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (selectedDeptId) {
                  loadExplorerData(selectedDeptId, explorerData?.currentFolder.id, e.target.value);
                }
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  if (selectedDeptId) {
                    loadExplorerData(selectedDeptId, explorerData?.currentFolder.id);
                  }
                }}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Mode Action Buttons */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'files'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>📄</span>
              <span>Explorer</span>
            </button>

            <button
              onClick={() => setShowFolderModal(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5"
            >
              <span>📁</span>
              <span>+ New Folder</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>⬆️</span>
              <span>Upload Document</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: REAL FILES & FOLDERS EXPLORER                                      */}
        {/* ========================================================================= */}
        {activeTab === 'files' && (
          <div className="space-y-6">
            {/* Explorer Header Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    <span>🏢</span>
                    <span>Department Repository: {currentDeptName}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Secure divisional document archive with verified role-based access
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {explorerData && explorerData.files.length > 0 && (
                    <button
                      onClick={handleExportDirectoryCSV}
                      className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition flex items-center gap-1.5 shadow-sm"
                      title="Download full CSV report of files in this repository"
                    >
                      <span>📥</span>
                      <span>Download Index (CSV)</span>
                    </button>
                  )}
                  <span className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
                    Permissions: VIEW • UPLOAD • DOWNLOAD
                  </span>
                </div>
              </div>

              {/* Interactive Breadcrumbs Navigation */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center gap-2 text-xs overflow-x-auto">
                <span className="text-slate-500 font-semibold">Location:</span>
                {explorerData?.breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === explorerData.breadcrumbs.length - 1;
                  return (
                    <div key={idx} className="flex items-center gap-2 whitespace-nowrap">
                      {idx > 0 && <span className="text-slate-600">/</span>}
                      <button
                        disabled={isLast}
                        onClick={() => {
                          if (selectedDeptId) {
                            if (crumb.id === null) {
                              loadExplorerData(selectedDeptId);
                            } else {
                              loadExplorerData(selectedDeptId, crumb.id);
                            }
                          }
                        }}
                        className={`transition ${
                          isLast
                            ? 'text-white font-bold cursor-default'
                            : 'text-blue-400 hover:text-blue-300 hover:underline font-medium'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Department Statistics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Folders</span>
                  <span className="text-white font-bold text-base">
                    {explorerData?.statistics.foldersCount ?? 0}
                  </span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Files</span>
                  <span className="text-white font-bold text-base">
                    {explorerData?.statistics.filesCount ?? 0}
                  </span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Storage Used</span>
                  <span className="text-white font-bold text-base">
                    {formatBytes(explorerData?.statistics.storageBytes ?? 0)}
                  </span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Staff Assigned</span>
                  <span className="text-white font-bold text-base">
                    {explorerData?.statistics.employeesCount ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {explorerLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
                <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
                <p>Loading files and folders...</p>
              </div>
            ) : explorerData &&
              explorerData.folders.length === 0 &&
              explorerData.files.length === 0 ? (
              /* EMPTY FOLDER / DIRECTORY STATE */
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-3xl flex items-center justify-center mx-auto mb-4">
                  📄
                </div>
                <h4 className="text-base font-bold text-white">No documents in this directory yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                  Upload your departmental documents (PDF, Word, Excel, CSV, Images, etc. up to 50MB) to start collaborating.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowFolderModal(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition"
                  >
                    + Create Subfolder
                  </button>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition"
                  >
                    + Upload File
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. FOLDERS GRID */}
                {explorerData && explorerData.folders.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>📁</span>
                      <span>Folders ({explorerData.folders.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {explorerData.folders.map((f) => (
                        <div
                          key={f.id}
                          onClick={() => {
                            if (selectedDeptId) {
                              loadExplorerData(selectedDeptId, f.id);
                            }
                          }}
                          className="p-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/50 rounded-xl flex items-center justify-between transition group cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-2xl shrink-0">📁</span>
                            <div className="min-w-0">
                              <div className="font-semibold text-white text-xs truncate group-hover:text-blue-400 transition">
                                {f.name}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Created: {new Date(f.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 bg-slate-800 text-slate-300 text-[11px] font-semibold rounded-lg group-hover:bg-blue-600 group-hover:text-white transition shrink-0 ml-2">
                            Open &rarr;
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. FILES TABLE */}
                {explorerData && explorerData.files.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>📄</span>
                      <span>Files ({explorerData.files.length})</span>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                            <tr>
                              <th className="px-5 py-3.5">File Name</th>
                              <th className="px-5 py-3.5">Size</th>
                              <th className="px-5 py-3.5">Uploaded By</th>
                              <th className="px-5 py-3.5">Date Added</th>
                              <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80">
                            {explorerData.files.map((file) => (
                              <tr key={file.id} className="hover:bg-slate-800/40 transition">
                                {/* Name & Type */}
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-lg">{getFileIcon(file.originalName)}</span>
                                    <div>
                                      <span className="font-semibold text-white block">
                                        {file.originalName}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        {file.mimeType}
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* Size */}
                                <td className="px-5 py-3.5 font-mono text-slate-300">
                                  {formatBytes(file.size)}
                                </td>

                                {/* Uploaded By */}
                                <td className="px-5 py-3.5">
                                  <span className="text-slate-300 font-medium">
                                    {file.uploaderName || 'Staff Member'}
                                  </span>
                                  {file.uploaderEmail && (
                                    <span className="block text-[10px] text-slate-500 font-mono">
                                      {file.uploaderEmail}
                                    </span>
                                  )}
                                </td>

                                {/* Upload Date */}
                                <td className="px-5 py-3.5 text-slate-400">
                                  {new Date(file.uploadedAt).toLocaleString()}
                                </td>

                                {/* Download & Preview Action Buttons */}
                                <td className="px-5 py-3.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setPreviewTarget(file)}
                                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition flex items-center gap-1 border border-slate-700"
                                      title="Preview file details"
                                    >
                                      <span>👁️</span>
                                      <span>Preview</span>
                                    </button>

                                    <a
                                      href={`/api/files/${file.id}/download`}
                                      download={file.originalName}
                                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5"
                                      title={`Download ${file.originalName}`}
                                    >
                                      <span className="text-xs">⬇️</span>
                                      <span>Download</span>
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: REAL DOCUMENT UPLOAD FORM                                          */}
        {/* ========================================================================= */}
        {activeTab === 'upload' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto shadow-xl animate-in fade-in">
            <div className="mb-6 pb-4 border-b border-slate-800 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-extrabold text-white tracking-tight">
                  Upload Document to {currentDeptName}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Destination folder:{' '}
                  <strong className="text-white">
                    {explorerData?.currentFolder.name || currentDeptName}
                  </strong>
                </p>
              </div>

              <button
                onClick={() => setActiveTab('files')}
                className="text-xs text-slate-400 hover:text-white font-semibold"
              >
                &larr; Back to Explorer
              </button>
            </div>

            <form onSubmit={handleUploadFile} className="space-y-6">
              {/* File Dropzone */}
              <div className="border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-2xl p-8 text-center bg-slate-950/70 transition">
                <span className="text-4xl block mb-3">📤</span>
                <p className="text-sm font-bold text-white mb-1">Choose a document to upload</p>
                <p className="text-xs text-slate-400 mb-4">
                  Supported files: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, PNG, JPG, WEBP, ZIP (Up to 50MB)
                </p>

                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full max-w-sm mx-auto text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                />
              </div>

              {/* Selected File Info Card */}
              {uploadFile && (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs animate-in zoom-in-95">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getFileIcon(uploadFile.name)}</span>
                    <div>
                      <div className="font-bold text-white">{uploadFile.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {formatBytes(uploadFile.size)} • {uploadFile.type || 'Document'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadFile(null)}
                    className="text-slate-400 hover:text-red-400 font-bold px-2 py-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('files')}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading || !uploadFile}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold text-white transition shadow-lg shadow-blue-600/30 flex items-center gap-2"
                >
                  {uploadLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Uploading Document...</span>
                    </>
                  ) : (
                    <>
                      <span>⬆️</span>
                      <span>Start Upload</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CREATE SUBFOLDER                                                   */}
      {/* ========================================================================= */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Create New Subfolder</h3>
                <p className="text-xs text-slate-400">
                  Inside: {explorerData?.currentFolder.name || currentDeptName}
                </p>
              </div>
              <button
                onClick={() => setShowFolderModal(false)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

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
                  placeholder="e.g. Models & Dataset 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={folderLoading || !newFolderName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5"
                >
                  {folderLoading ? 'Creating...' : '+ Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FILE PREVIEW & DETAILS                                             */}
      {/* ========================================================================= */}
      {previewTarget && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getFileIcon(previewTarget.originalName)}</span>
                <h3 className="text-base font-bold text-white truncate max-w-xs">
                  {previewTarget.originalName}
                </h3>
              </div>
              <button
                onClick={() => setPreviewTarget(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2.5 text-xs mb-6">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">File Name:</span>
                <span className="font-semibold text-white">{previewTarget.originalName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">File Size:</span>
                <span className="font-mono text-slate-300">{formatBytes(previewTarget.size)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">MIME Type:</span>
                <span className="font-mono text-slate-300">{previewTarget.mimeType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Uploaded By:</span>
                <span className="font-semibold text-blue-400">
                  {previewTarget.uploaderName || 'Staff Member'} ({previewTarget.uploaderEmail || 'Staff'})
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Upload Date:</span>
                <span className="text-slate-300">{new Date(previewTarget.uploadedAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewTarget(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Close
              </button>
              <a
                href={`/api/files/${previewTarget.id}/download`}
                download={previewTarget.originalName}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 inline-flex items-center gap-2 transition"
              >
                <span className="text-base">⬇️</span>
                <span>Download Document ({formatBytes(previewTarget.size)})</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

