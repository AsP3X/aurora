// Human: Sticky admin header with hamburger (mobile), brand link, optional `extra` slot, and account menu.
// Agent: CALLS onMenuToggle; STATE showUserMenu; LOGOUT clears auth via useAuth.
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useState } from "react";

export default function AdminTopbar({
  onMenuToggle,
  extra,
}: {
  onMenuToggle: () => void;
  extra?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="h-16 bg-white/5 border-b border-white/10 backdrop-blur-2xl shrink-0 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 rounded-lg text-surface-300 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center shadow-lg shadow-aurora-500/20">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <span className="font-bold tracking-tight text-white hidden sm:block">Aurora</span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-aurora-500/10 border border-aurora-500/20 text-xs font-medium text-aurora-300">
            Admin
          </span>
        </Link>
      </div>

      {extra && <div className="flex-1 max-w-xl mx-4 md:mx-8">{extra}</div>}

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center text-xs font-bold text-white">
              {user?.email?.[0]?.toUpperCase() || "?"}
            </div>
            <span className="text-xs text-surface-300 hidden sm:block max-w-[120px] truncate">{user?.email}</span>
            <svg className="w-3 h-3 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showUserMenu && (
            <>
              <div className="absolute right-0 mt-2 w-48 bg-surface-900/95 border border-white/10 backdrop-blur-xl rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                  <p className="text-xs text-surface-500 capitalize">{user?.role}</p>
                </div>
                <Link
                  to="/"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Library
                </Link>
                <button
                  onClick={() => { logout(); setShowUserMenu(false); }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
