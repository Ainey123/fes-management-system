'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallAppButtonProps {
  className?: string;
  variant?: 'primary' | 'secondary' | 'navbar';
}

export default function InstallAppButton({
  className = '',
  variant = 'primary',
}: InstallAppButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('Install prompt error:', err);
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  const handleDownloadWindowsApp = () => {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://fes-management-system.vercel.app';
    const shortcutContent = `[InternetShortcut]\nURL=${appUrl}\nIconIndex=0\nIconFile=${appUrl}/icon.svg\n`;
    const blob = new Blob([shortcutContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Fast_Engineering_Management_System.url';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isInstalled) {
    return null;
  }

  const defaultClasses =
    variant === 'navbar'
      ? 'px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition active:scale-95 cursor-pointer'
      : variant === 'secondary'
      ? 'px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition cursor-pointer'
      : 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-blue-500/25 flex items-center gap-2 transition active:scale-95 cursor-pointer';

  return (
    <>
      <button
        onClick={handleInstallClick}
        className={className || defaultClasses}
        title="Install Fast Engineering Application on your device"
      >
        <span className="text-base leading-none">📲</span>
        <span>Install App</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-md shadow-blue-500/30">
                  FES
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Install Fast Engineering App</h3>
                  <p className="text-xs text-slate-400">Enterprise Desktop & Mobile Application</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              {deferredPrompt && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-white">Browser Ready to Install</div>
                    <div className="text-[11px] text-slate-300">Click below to install directly onto your system.</div>
                  </div>
                  <button
                    onClick={handleInstallClick}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition shrink-0"
                  >
                    Install Now
                  </button>
                </div>
              )}

              {/* Option 1: Direct Windows Desktop Shortcut */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="text-base">💻</span>
                    <span>Option 1: Windows Desktop App Launcher</span>
                  </div>
                  <button
                    onClick={handleDownloadWindowsApp}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white border border-blue-500/30 font-bold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <span>⬇️</span>
                    <span>Download (.url)</span>
                  </button>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Downloads a 1-click desktop app shortcut to your computer. Double-click it anytime on your Windows Desktop to open Fast Engineering instantly!
                </p>
              </div>

              {/* Option 2: Browser Install instructions */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  <span>Option 2: Browser Address Bar Install (Edge & Chrome)</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Look at the right side of your browser&apos;s URL address bar for the <strong>Install icon (⊕ or 💻)</strong> &rarr; click <strong>Install</strong>.<br />
                  Or click the browser menu (<strong>⋮</strong>) &rarr; <strong>&quot;Install Fast Engineering Management System&quot;</strong>.
                </p>
              </div>

              {/* Option 3: Mobile Install */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="text-base">📱</span>
                  <span>Option 3: Mobile (iPhone & Android)</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  • <strong>iPhone / Safari</strong>: Tap <strong>Share (⎋)</strong> &rarr; scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.<br />
                  • <strong>Android / Chrome</strong>: Tap menu (<strong>⋮</strong>) &rarr; tap <strong>&quot;Install App&quot;</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
              <button
                onClick={handleDownloadWindowsApp}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <span>💻</span>
                <span>Get Desktop Shortcut</span>
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

