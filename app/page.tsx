import Link from "next/link";
import InstallAppButton from "@/src/components/InstallAppButton";

const departmentsList = [
  { name: "Engineering Department", desc: "Technical documents, specifications, and project schematics", icon: "📐" },
  { name: "Accounts Department", desc: "Financial statements, billing, vouchers, and tax audits", icon: "📊" },
  { name: "HR & Administration", desc: "Employee records, company policies, and administrative docs", icon: "👥" },
  { name: "Pre-Requirement", desc: "Project tenders, client requirements, and feasibility files", icon: "📋" },
  { name: "Business", desc: "Client proposals, contract negotiations, and corporate strategy", icon: "💼" },
  { name: "Registration", desc: "Statutory compliance, legal registrations, and trade licenses", icon: "🏛️" },
  { name: "Workplace", desc: "Facilities management, HSE safety protocols, and operational files", icon: "🏢" },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xl text-white shadow-md shadow-blue-500/20">
              FES
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">FAST ENGINEERING</span>
              <span className="hidden sm:inline-block ml-2 text-xs bg-blue-900/50 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-medium">
                Enterprise Management
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <InstallAppButton variant="navbar" />
            <Link
              href="/setup"
              className="text-xs sm:text-sm font-medium text-slate-300 hover:text-white px-3 py-2 rounded-md transition"
            >
              Setup Admin
            </Link>
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg shadow transition shadow-blue-600/30 font-semibold"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Fast Engineering Secure Cloud Portal
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight mb-6">
            Enterprise File & Department Management System
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-8 leading-relaxed">
            Centralized document repository with hierarchical folder architecture, strict role-based access control (RBAC), immutable audit tracking, and real-time department isolation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-600/30 transition text-center"
            >
              Access Employee Portal
            </Link>
            <Link
              href="/admin"
              className="w-full sm:w-auto px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-lg transition text-center"
            >
              Admin Dashboard
            </Link>
          </div>
        </div>

        {/* Quick Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-6 hover:border-blue-500/50 transition">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-2xl mb-4">
              🔐
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Role-Based Access</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Granular departmental permissions for VIEW, UPLOAD, DOWNLOAD, EDIT, and DELETE operations.
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-6 hover:border-blue-500/50 transition">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-2xl mb-4">
              📁
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">FAST ENGINEERING Root</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Strictly structured root folder containing dedicated department directories, nested folders, and soft-delete protections.
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-6 hover:border-blue-500/50 transition">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-2xl mb-4">
              🛡️
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Comprehensive Audit Log</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Immutable logging of all file uploads, modifications, folder operations, user creation, and authentication events.
            </p>
          </div>
        </div>

        {/* 7 Fast Engineering Departments */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Organization Departments</h2>
              <p className="text-sm text-slate-400">The 7 operational divisions managed under Fast Engineering</p>
            </div>
            <Link
              href="/login"
              className="mt-4 sm:mt-0 text-sm font-semibold text-blue-400 hover:text-blue-300 transition"
            >
              Explore Department Files &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {departmentsList.map((dept, i) => (
              <div
                key={dept.name}
                className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-5 hover:bg-slate-800/70 transition"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{dept.icon}</span>
                  <h3 className="font-semibold text-white text-sm">{dept.name}</h3>
                </div>
                <p className="text-xs text-slate-400">{dept.desc}</p>
                <div className="mt-4 pt-3 border-t border-slate-700/40 flex justify-between items-center text-[11px] text-slate-500">
                  <span>Unit #{i + 1}</span>
                  <span className="text-blue-400 font-medium">Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-8 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Fast Engineering. All rights reserved. Enterprise Document Management System.</p>
        </div>
      </footer>
    </div>
  );
}
