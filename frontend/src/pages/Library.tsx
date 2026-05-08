import { Link, useLocation } from "react-router-dom";

function NavItem({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-surface-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}

export default function Library() {
  return (
    <div className="h-screen flex flex-col">
      {/* ─── Topbar ─── */}
      <div className="h-16 bg-surface-800 border-b border-white/5 shrink-0 flex items-center justify-between px-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-aurora-700" />
          <span className="font-bold tracking-tight">Aurora</span>
        </div>

        {/* Global search */}
        <div className="flex-1 max-w-xl mx-8">
          <div className="h-10 bg-surface-900 border border-white/5 rounded-full" />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-4">
          {/* Notification bell */}
          <div className="w-9 h-9 rounded-full bg-surface-900 border border-white/5" />
          {/* User avatar */}
          <div className="w-9 h-9 rounded-full bg-surface-900 border border-white/5" />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar ─── */}
        <div className="w-64 bg-surface-800 border-r border-white/5 shrink-0 flex flex-col">
          {/* Main nav */}
          <div className="p-4 space-y-1">
            <NavItem to="/" label="Library" />
            <NavItem to="/playlists" label="Playlists" />
            <NavItem to="/artists" label="Artists" />
            <NavItem to="/albums" label="Albums" />
            <NavItem to="/genres" label="Genres" />
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-white/5" />

          {/* Quick actions */}
          <div className="p-4 space-y-2">
            <div className="h-9 bg-surface-900/60 border border-white/5 rounded-lg" />
            <div className="h-9 bg-surface-900/60 border border-white/5 rounded-lg" />
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-white/5" />

          {/* Playlists section */}
          <div className="p-4 flex-1">
            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
              Your Playlists
            </div>
            <div className="space-y-2">
              <div className="h-8 bg-surface-900/40 rounded-md" />
              <div className="h-8 bg-surface-900/40 rounded-md" />
              <div className="h-8 bg-surface-900/40 rounded-md" />
              <div className="h-8 bg-surface-900/40 rounded-md" />
            </div>
          </div>

          {/* Mini player */}
          <div className="p-4 border-t border-white/5">
            <div className="h-20 bg-surface-900/60 border border-white/5 rounded-xl" />
          </div>
        </div>

        {/* ─── Main content ─── */}
        <div className="flex-1 bg-surface-950 p-8 overflow-auto">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="h-28 bg-surface-900 border border-white/5 rounded-2xl" />
            <div className="h-28 bg-surface-900 border border-white/5 rounded-2xl" />
            <div className="h-28 bg-surface-900 border border-white/5 rounded-2xl" />
            <div className="h-28 bg-surface-900 border border-white/5 rounded-2xl" />
          </div>

          {/* Content sections */}
          <div className="space-y-8">
            {/* Section header + grid */}
            <div>
              <div className="h-7 w-48 bg-surface-900/60 rounded-lg mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-square bg-surface-900 border border-white/5 rounded-xl" />
                    <div className="h-4 bg-surface-900/60 rounded w-3/4" />
                    <div className="h-3 bg-surface-900/40 rounded w-1/2" />
                  </div>
                ))}
              </div>
            </div>

            {/* Another section */}
            <div>
              <div className="h-7 w-48 bg-surface-900/60 rounded-lg mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-square bg-surface-900 border border-white/5 rounded-xl" />
                    <div className="h-4 bg-surface-900/60 rounded w-3/4" />
                    <div className="h-3 bg-surface-900/40 rounded w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
