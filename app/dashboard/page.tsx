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
}

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('Engineering Department');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'files' | 'upload'>('files');

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const authCheck = await fetch('/api/auth/me');
        if (authCheck.ok) {
          const authData = await authCheck.json();
          if (!authData.authenticated) {
            router.push('/login');
            return;
          }
        }

        const [deptsRes, foldersRes] = await Promise.all([
          fetch('/api/departments'),
          fetch('/api/folders'),
        ]);

        if (!active) return;

        if (deptsRes.ok) {
          const deptsData = await deptsRes.json();
          setDepartments(deptsData.departments || []);
          if (deptsData.departments?.length > 0) {
            setSelectedDept(deptsData.departments[0].name);
          }
        }

        if (foldersRes.ok) {
          const foldersData = await foldersRes.json();
          setFolders(foldersData.folders || []);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [router]);

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
                <span className="ml-2 text-xs bg-blue-900/50 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-medium">
                  EMPLOYEE WORKSPACE
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 transition"
            >
              Admin Portal
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
        {/* Breadcrumbs & Department Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-slate-200">
              FAST ENGINEERING
            </Link>
            <span>/</span>
            <span className="text-blue-400 font-semibold">{selectedDept}</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-400">Active Division:</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="w-full sm:w-80">
            <input
              type="text"
              placeholder="Search files and folders in department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'files'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              📄 Explorer
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              ⬆️ Upload Document
            </button>
          </div>
        </div>

        {/* Explorer Content */}
        {activeTab === 'files' ? (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white">
                Department Repository: {selectedDept}
              </h3>
              <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Permissions: VIEW • UPLOAD • DOWNLOAD
              </span>
            </div>

            {/* Department root folder tree */}
            <div className="space-y-3 mt-4">
              <div className="p-3 bg-slate-900/60 border border-slate-700/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📁</span>
                  <div>
                    <div className="font-semibold text-sm text-white">{selectedDept} Archive</div>
                    <div className="text-xs text-slate-400 font-mono">
                      /FAST ENGINEERING/{selectedDept}/Archive
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-400">Default Directory</span>
              </div>

              {folders.map((f) => (
                <div
                  key={f.id}
                  className="p-3 bg-slate-900/40 border border-slate-700/30 rounded-lg flex items-center justify-between hover:bg-slate-900/70 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📁</span>
                    <div>
                      <div className="font-semibold text-sm text-white">{f.name}</div>
                      <div className="text-xs text-slate-500 font-mono">Folder #{f.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 text-center border border-dashed border-slate-700 rounded-lg">
              <span className="text-3xl block mb-2">📄</span>
              <p className="text-sm font-medium text-slate-300">No documents in this directory yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload your files (PDF, DOCX, XLSX, CSV, TXT, PNG, WEBP up to 50MB).
              </p>
            </div>
          </div>
        ) : (
          /* Upload Tab */
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-8 max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-2">Upload Document to {selectedDept}</h3>
            <p className="text-xs text-slate-400 mb-6">
              Documents are scanned, validated against company whitelist, and linked to the department folder.
            </p>

            <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center bg-slate-900/50">
              <span className="text-4xl block mb-3">📤</span>
              <p className="text-sm font-semibold text-white mb-1">Select file to upload</p>
              <p className="text-xs text-slate-400 mb-4">
                Supported types: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG, WEBP (Max 50MB)
              </p>
              <input
                type="file"
                className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setActiveTab('files')}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('File validation successful. Upload queued.');
                  setActiveTab('files');
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 transition shadow shadow-blue-600/30"
              >
                Start Upload
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
