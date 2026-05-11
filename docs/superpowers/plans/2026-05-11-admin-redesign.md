# Admin Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `AdminDashboard.tsx` into a dedicated sidebar-based admin shell with individual pages for Overview, Users, Groups, Library, Playlists, and Settings.

**Architecture:** New `AdminLayout` component provides a sidebar + topbar shell. Each admin section becomes its own page component under `pages/admin/`. React Router routes under `/admin/*` point to each page. The existing `AdminDashboard.tsx` is replaced by the new page structure.

**Tech Stack:** React 19, React Router v7, Tailwind CSS v4, hand-rolled SVG icons.

---

## File Structure

### New Components
| File | Responsibility |
|---|---|
| `frontend/src/components/admin/AdminLayout.tsx` | Admin shell: sidebar + topbar + main content area. Wraps all admin pages. |
| `frontend/src/components/admin/AdminSidebar.tsx` | Navigation sidebar with icon+label items, active state, mobile drawer, "Back to Library" link. |
| `frontend/src/components/admin/AdminTopbar.tsx` | Topbar with Aurora logo, "Admin" badge, page-specific action slot, user dropdown. |
| `frontend/src/components/admin/Breadcrumbs.tsx` | Breadcrumb trail: `Home > Admin > Section`. |

### New Pages
| File | Responsibility |
|---|---|
| `frontend/src/pages/admin/AdminOverviewPage.tsx` | Stats cards + quick actions + system info. |
| `frontend/src/pages/admin/AdminUsersPage.tsx` | User table, edit role modal, edit permissions modal. |
| `frontend/src/pages/admin/AdminGroupsPage.tsx` | Group list + group detail (permissions + members). |
| `frontend/src/pages/admin/AdminLibraryPage.tsx` | Song table, search, pagination, upload button, edit song modal. |
| `frontend/src/pages/admin/AdminPlaylistsPage.tsx` | Playlist table. |
| `frontend/src/pages/admin/AdminSettingsPage.tsx` | Settings table with inline edit. |

### Modified Files
| File | Change |
|---|---|
| `frontend/src/App.tsx` | Replace `/admin/*` route to use `AdminLayout` with nested routes for each admin page. |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Delete after all pages are verified working. |

### Helper Components (copied/extracted from existing)
| File | Responsibility |
|---|---|
| `frontend/src/components/admin/StatCard.tsx` | Reusable stat card (used by Overview and can be shared). |
| `frontend/src/components/admin/ConfirmModal.tsx` | Reusable confirmation modal. |

---

## Shared Types & Helpers

These types and helpers are used across multiple admin pages. They are defined inline in each file to match the existing codebase pattern (no shared utils file for formatting).

```typescript
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}
```

---

## Task 1: Create Admin Shell Components

### Step 1.1: Create `AdminSidebar.tsx`

**File:** `frontend/src/components/admin/AdminSidebar.tsx`

Create a sidebar component with navigation items, active state, and mobile drawer behavior.

```tsx
import { Link, useLocation } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { to: "/admin", label: "Overview", icon: <OverviewIcon /> },
  { to: "/admin/users", label: "Users", icon: <UsersIcon /> },
  { to: "/admin/groups", label: "Groups", icon: <GroupsIcon /> },
  { to: "/admin/library", label: "Library", icon: <LibraryIcon /> },
  { to: "/admin/playlists", label: "Playlists", icon: <PlaylistsIcon /> },
  { to: "/admin/settings", label: "Settings", icon: <SettingsIcon /> },
];

export default function AdminSidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 w-64 z-50 md:z-30 bg-surface-900/95 border-r border-white/10 backdrop-blur-xl flex flex-col h-[calc(100vh-4rem)] transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const active =
              item.to === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-aurora-500/10 text-aurora-300 border-l-2 border-aurora-500"
                    : "text-surface-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className={active ? "text-aurora-400" : "text-surface-500"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <span className="text-surface-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </span>
            Back to Library
          </Link>
        </div>
      </aside>
    </>
  );
}

/* Icons */
function OverviewIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
    </svg>
  );
}

function GroupsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}

function PlaylistsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
```

### Step 1.2: Create `AdminTopbar.tsx`

**File:** `frontend/src/components/admin/AdminTopbar.tsx`

```tsx
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
    <header className="h-16 bg-surface-900/80 border-b border-white/10 backdrop-blur-xl shrink-0 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
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
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-surface-800 border border-white/5 hover:border-white/10 transition-colors"
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
              <div className="absolute right-0 mt-2 w-48 bg-surface-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
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
```

### Step 1.3: Create `Breadcrumbs.tsx`

**File:** `frontend/src/components/admin/Breadcrumbs.tsx`

```tsx
import { Link, useLocation } from "react-router-dom";

const labelMap: Record<string, string> = {
  "/admin": "Overview",
  "/admin/users": "Users",
  "/admin/groups": "Groups",
  "/admin/library": "Library",
  "/admin/playlists": "Playlists",
  "/admin/settings": "Settings",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const label = labelMap[pathname] || "Admin";

  return (
    <nav className="flex items-center gap-2 text-sm px-4 md:px-8 py-3 text-surface-500">
      <Link to="/" className="hover:text-white transition-colors">Home</Link>
      <span className="text-surface-700">/</span>
      <Link to="/admin" className="hover:text-white transition-colors">Admin</Link>
      <span className="text-surface-700">/</span>
      <span className="text-white font-medium">{label}</span>
    </nav>
  );
}
```

### Step 1.4: Create `AdminLayout.tsx`

**File:** `frontend/src/components/admin/AdminLayout.tsx`

```tsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import Breadcrumbs from "./Breadcrumbs";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col">
      <AdminTopbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <AdminSidebar mobileOpen={sidebarOpen} onCloseMobile={() => setSidebarOpen(false)} />
      <div className="md:ml-64 flex-1 flex flex-col min-h-[calc(100vh-4rem)]">
        <Breadcrumbs />
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

### Step 1.5: Commit

```bash
git add frontend/src/components/admin/AdminSidebar.tsx
	frontend/src/components/admin/AdminTopbar.tsx
	frontend/src/components/admin/Breadcrumbs.tsx
	frontend/src/components/admin/AdminLayout.tsx
git commit -m "feat(admin): add AdminLayout shell with sidebar, topbar, breadcrumbs"
```

---

## Task 2: Create Shared Admin Components

### Step 2.1: Create `StatCard.tsx`

**File:** `frontend/src/components/admin/StatCard.tsx`

```tsx
export default function StatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="bg-surface-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4 hover:border-white/10 transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-xs text-surface-400 font-medium uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
```

### Step 2.2: Create `ConfirmModal.tsx`

**File:** `frontend/src/components/admin/ConfirmModal.tsx`

```tsx
export default function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmLabel = "Delete",
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-surface-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 2.3: Commit

```bash
git add frontend/src/components/admin/StatCard.tsx
	frontend/src/components/admin/ConfirmModal.tsx
git commit -m "feat(admin): add shared StatCard and ConfirmModal components"
```

---

## Task 3: Create Admin Overview Page

### Step 3.1: Create `AdminOverviewPage.tsx`

**File:** `frontend/src/pages/admin/AdminOverviewPage.tsx`

Extract the Overview tab content from `AdminDashboard.tsx` into its own page. Use `StatCard` from the shared component. Keep all existing data loading (`fetchAdminStats`).

```tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminStats } from "../../api/client";
import StatCard from "../../components/admin/StatCard";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default function AdminOverviewPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<{
    total_users: number;
    total_songs: number;
    total_playlists: number;
    total_storage_bytes: number;
  } | null>(null);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Users"
          value={stats ? formatNumber(stats.total_users) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          }
          colorClass="bg-aurora-600/20 text-aurora-400"
        />
        <StatCard
          label="Songs"
          value={stats ? formatNumber(stats.total_songs) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          }
          colorClass="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          label="Playlists"
          value={stats ? formatNumber(stats.total_playlists) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
          colorClass="bg-amber-500/20 text-amber-400"
        />
        <StatCard
          label="Storage Used"
          value={stats ? formatBytes(stats.total_storage_bytes) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          }
          colorClass="bg-rose-500/20 text-rose-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <ActionCard icon={<UsersIcon />} label="Manage Users" onClick={() => navigate("/admin/users")} />
            <ActionCard icon={<LibraryIcon />} label="Browse Library" onClick={() => navigate("/admin/library")} />
            <ActionCard icon={<PlaylistsIcon />} label="View Playlists" onClick={() => navigate("/admin/playlists")} />
            <ActionCard icon={<SettingsIcon />} label="Edit Settings" onClick={() => navigate("/admin/settings")} />
          </div>
        </div>

        <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">System Info</h3>
          <div className="space-y-3 text-sm">
            <InfoRow label="Total registered users" value={stats ? formatNumber(stats.total_users) : "—"} />
            <InfoRow label="Tracks in library" value={stats ? formatNumber(stats.total_songs) : "—"} />
            <InfoRow label="User playlists" value={stats ? formatNumber(stats.total_playlists) : "—"} />
            <InfoRow label="Library storage" value={stats ? formatBytes(stats.total_storage_bytes) : "—"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 bg-surface-800/50 border border-white/5 rounded-xl hover:border-white/10 hover:bg-surface-800 transition-all"
    >
      <span className="text-aurora-400">{icon}</span>
      <span className="text-sm font-medium text-white">{label}</span>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-surface-400">
      <span>{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

/* Inline icons for Quick Actions */
function UsersIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128A9.373 9.373 0 0112.005 21m0 0v-.003c0-1.113-.285-2.16-.786-3.07m0 0a9.378 9.378 0 00-4.252 1.935M12.005 21a9.38 9.38 0 01-2.625-.372m0 0a9.337 9.337 0 01-4.121-.952 4.125 4.125 0 007.533 2.493m0 0v.003c0 1.113.285 2.16.786 3.07m0 0a9.378 9.378 0 004.252-1.935M12.005 21v.005" />
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}
function PlaylistsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
```

### Step 3.2: Commit

```bash
git add frontend/src/pages/admin/AdminOverviewPage.tsx
git commit -m "feat(admin): add Overview page with stats and quick actions"
```

---

## Task 4: Create Admin Users Page

### Step 4.1: Create `AdminUsersPage.tsx`

**File:** `frontend/src/pages/admin/AdminUsersPage.tsx`

Extract Users tab logic from `AdminDashboard.tsx`. Include user table, edit role dialog, and permissions dialog. Reuse `ConfirmModal` and `PermissionManager`.

```tsx
import { useState, useEffect, useCallback } from "react";
import {
  fetchUsers,
  fetchPermissions,
  fetchUserPermissions,
  fetchUserEffectivePermissions,
  setUserPermissions,
  updateUserRole,
  deleteUser,
} from "../../api/client";
import PermissionManager from "../../components/admin/PermissionManager";
import ConfirmModal from "../../components/admin/ConfirmModal";

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface User {
  id: string;
  email: string;
  role: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  const [editingPermissionsFor, setEditingPermissionsFor] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [userEffectivePerms, setUserEffectivePerms] = useState<string[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetchPermissions();
      setPermissions(data);
    } catch (e: any) {
      setError(e.message || "Failed to load permissions");
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadPermissions();
  }, [loadUsers, loadPermissions]);

  useEffect(() => {
    if (!editingPermissionsFor) return;
    setUserLoading(true);
    Promise.all([
      fetchUserPermissions(editingPermissionsFor),
      fetchUserEffectivePermissions(editingPermissionsFor),
    ])
      .then(([perms, effective]) => {
        setUserPerms(perms.map((p: Permission) => p.key));
        setUserEffectivePerms(effective);
      })
      .catch((e: any) => setError(e.message || "Failed to load user permissions"))
      .finally(() => setUserLoading(false));
  }, [editingPermissionsFor]);

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e: any) {
      setError(e.message || "Failed to update role");
    }
  }

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await deleteUser(confirmModal.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveUserPermissions() {
    if (!editingPermissionsFor) return;
    setSaving(true);
    try {
      await setUserPermissions(editingPermissionsFor, userPerms);
      const effective = await fetchUserEffectivePermissions(editingPermissionsFor);
      setUserEffectivePerms(effective);
      setEditingPermissionsFor(null);
    } catch (e: any) {
      setError(e.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[500px]">
          <thead className="bg-surface-950/50 text-surface-400 text-xs uppercase border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-surface-500">
                  <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-surface-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center text-xs font-bold text-white">
                        {u.email[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${
                      u.role === "admin"
                        ? "bg-aurora-500/10 text-aurora-300 border-aurora-500/20"
                        : "bg-surface-800 text-surface-300 border-white/10"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingUser(u.id); setEditRole(u.role); }}
                        className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmModal({ id: u.id, name: u.email })}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Edit User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-surface-400 mb-1">Email</label>
                <p className="text-sm text-white">{users.find((u) => u.id === editingUser)?.email}</p>
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                >
                  <option value="listener">listener</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setUserLoading(true);
                  setEditingPermissionsFor(editingUser);
                }}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-aurora-300 text-sm font-medium rounded-lg transition-colors border border-aurora-500/20"
              >
                Edit Permissions
              </button>
              <button
                onClick={async () => {
                  const user = users.find((u) => u.id === editingUser);
                  if (user && editRole !== user.role) {
                    await handleRoleChange(editingUser, editRole);
                  }
                  setEditingUser(null);
                }}
                className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Permissions Dialog */}
      {editingPermissionsFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Edit Permissions — {users.find((u) => u.id === editingPermissionsFor)?.email}
              </h3>
              <button
                onClick={() => setEditingPermissionsFor(null)}
                className="text-surface-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {userLoading ? (
              <div className="text-surface-400 text-sm">Loading...</div>
            ) : (
              <>
                <PermissionManager
                  permissions={permissions}
                  assignedKeys={userPerms}
                  onChange={setUserPerms}
                />
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-white mb-2">Effective Permissions</h4>
                  <div className="flex flex-wrap gap-2">
                    {userEffectivePerms.length > 0 ? (
                      userEffectivePerms.map((key) => (
                        <span key={key} className="px-2 py-1 bg-surface-800 text-surface-300 text-xs rounded-lg border border-white/5">
                          {key}
                        </span>
                      ))
                    ) : (
                      <div className="text-sm text-surface-500">No effective permissions.</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    onClick={() => setEditingPermissionsFor(null)}
                    className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveUserPermissions}
                    disabled={saving}
                    className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Permissions"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          title="Delete User"
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
```

### Step 4.2: Commit

```bash
git add frontend/src/pages/admin/AdminUsersPage.tsx
git commit -m "feat(admin): add Users page with role editing and permissions"
```

---

## Task 5: Create Admin Groups Page

### Step 5.1: Create `AdminGroupsPage.tsx`

**File:** `frontend/src/pages/admin/AdminGroupsPage.tsx`

Extract Groups tab logic. Two-column layout with group list on left, detail on right.

```tsx
import { useState, useEffect, useCallback } from "react";
import {
  fetchPermissions,
  fetchGroups,
  createGroup,
  fetchGroupPermissions,
  setGroupPermissions,
  fetchGroupMembers,
  addGroupMember,
  removeGroupMember,
  fetchUsers,
} from "../../api/client";
import PermissionManager from "../../components/admin/PermissionManager";

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
}

interface User {
  id: string;
  email: string;
  role: string;
}

export default function AdminGroupsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupPerms, setGroupPerms] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [addMemberId, setAddMemberId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetchPermissions();
      setPermissions(data);
    } catch (e: any) {
      setError(e.message || "Failed to load permissions");
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch (e: any) {
      setError(e.message || "Failed to load groups");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    }
  }, []);

  useEffect(() => {
    loadPermissions();
    loadGroups();
    loadUsers();
  }, [loadPermissions, loadGroups, loadUsers]);

  useEffect(() => {
    if (!selectedGroup) return;
    setGroupLoading(true);
    Promise.all([fetchGroupPermissions(selectedGroup), fetchGroupMembers(selectedGroup)])
      .then(([perms, members]) => {
        setGroupPerms(perms.map((p: Permission) => p.key));
        setGroupMembers(members);
      })
      .catch((e: any) => setError(e.message || "Failed to load group details"))
      .finally(() => setGroupLoading(false));
  }, [selectedGroup]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const group = await createGroup(newGroupName.trim(), newGroupDesc.trim() || undefined);
      setGroups((prev) => [...prev, group]);
      setNewGroupName("");
      setNewGroupDesc("");
      setSelectedGroup(group.id);
    } catch (e: any) {
      setError(e.message || "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleSaveGroupPermissions() {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      await setGroupPermissions(selectedGroup, groupPerms);
    } catch (e: any) {
      setError(e.message || "Failed to save group permissions");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!selectedGroup || !addMemberId) return;
    try {
      await addGroupMember(selectedGroup, addMemberId);
      const members = await fetchGroupMembers(selectedGroup);
      setGroupMembers(members);
      setAddMemberId("");
    } catch (e: any) {
      setError(e.message || "Failed to add member");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroup) return;
    try {
      await removeGroupMember(selectedGroup, userId);
      setGroupMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (e: any) {
      setError(e.message || "Failed to remove member");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Groups</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Group list + create */}
        <div className="space-y-4">
          <form onSubmit={handleCreateGroup} className="space-y-3">
            <input
              type="text"
              placeholder="New group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              className="w-full px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
            />
            <button
              type="submit"
              disabled={creatingGroup || !newGroupName.trim()}
              className="w-full py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {creatingGroup ? "Creating..." : "Create Group"}
            </button>
          </form>

          <div className="space-y-1">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                  selectedGroup === g.id
                    ? "bg-aurora-500/10 text-aurora-300 border border-aurora-500/20"
                    : "text-surface-300 hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="font-medium">{g.name}</div>
                {g.description && <div className="text-xs text-surface-500 truncate">{g.description}</div>}
              </button>
            ))}
            {groups.length === 0 && (
              <div className="text-sm text-surface-500 px-3 py-2">No groups yet.</div>
            )}
          </div>
        </div>

        {/* Right: Group detail */}
        <div className="lg:col-span-2 space-y-6">
          {selectedGroup ? (
            groupLoading ? (
              <div className="text-surface-400 text-sm">Loading...</div>
            ) : (
              <>
                <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      {groups.find((g) => g.id === selectedGroup)?.name}
                    </h3>
                    <button
                      onClick={handleSaveGroupPermissions}
                      disabled={saving}
                      className="px-4 py-1.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Permissions"}
                    </button>
                  </div>
                  <PermissionManager
                    permissions={permissions}
                    assignedKeys={groupPerms}
                    onChange={setGroupPerms}
                  />
                </div>

                <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
                  <h3 className="text-lg font-semibold text-white mb-4">Members</h3>
                  <div className="flex gap-2 mb-3">
                    <select
                      value={addMemberId}
                      onChange={(e) => setAddMemberId(e.target.value)}
                      className="flex-1 px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                    >
                      <option value="">Select user to add...</option>
                      {users
                        .filter((u) => !groupMembers.find((m) => m.id === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={handleAddMember}
                      disabled={!addMemberId}
                      className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {groupMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-surface-950/50 rounded-lg">
                        <span className="text-sm text-surface-300">{m.email}</span>
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {groupMembers.length === 0 && (
                      <div className="text-sm text-surface-500">No members yet.</div>
                    )}
                  </div>
                </div>
              </>
            )
          ) : (
            <div className="bg-surface-900 border border-white/5 rounded-2xl p-8 text-center text-surface-400 text-sm">
              Select a group to manage its permissions and members.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 5.2: Commit

```bash
git add frontend/src/pages/admin/AdminGroupsPage.tsx
git commit -m "feat(admin): add Groups page with permissions and members"
```

---

## Task 6: Create Admin Library Page

### Step 6.1: Create `AdminLibraryPage.tsx`

**File:** `frontend/src/pages/admin/AdminLibraryPage.tsx`

Extract Library tab logic. Include song table, search, pagination, upload button, edit song modal, context menu. Reuse `UploadSongDialog`, `ConfirmModal`, `MultiGenreField`, `ArtworkImage`, `ContextMenu`.

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchAdminSongs,
  deleteAdminSong,
  updateAdminSong,
  toggleAdminSongEnabled,
} from "../../api/client";
import ArtworkImage from "../../components/ArtworkImage";
import ContextMenu from "../../components/ui/ContextMenu";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import UploadSongDialog from "../../components/admin/UploadSongDialog";
import MultiGenreField from "../../components/admin/MultiGenreField";
import ConfirmModal from "../../components/admin/ConfirmModal";
import type { Song } from "../../types";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AdminLibraryPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [songQuery, setSongQuery] = useState("");
  const [songOffset, setSongOffset] = useState(0);
  const [songLoading, setSongLoading] = useState(false);
  const [error, setError] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const SONG_LIMIT = 20;

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);

  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    artist: "",
    album: "",
    album_artist: "",
    track_number: "",
    year: "",
    genres: [] as string[],
    studio: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const existingGenres = useMemo(() => {
    const genres = new Set<string>();
    songs.forEach((s) => s.genres.forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }, [songs]);

  const loadSongs = useCallback(async (q?: string, offset = 0) => {
    setSongLoading(true);
    try {
      const data = await fetchAdminSongs({ q, limit: SONG_LIMIT, offset, order_by: "title" });
      setSongs(data);
    } catch (e: any) {
      setError(e.message || "Failed to load songs");
    } finally {
      setSongLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSongs(songQuery || undefined, songOffset);
  }, [songQuery, songOffset, loadSongs]);

  function openEditDialog(song: Song) {
    setEditingSong(song);
    setEditForm({
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      album_artist: song.album_artist || "",
      track_number: song.track_number?.toString() || "",
      year: song.year?.toString() || "",
      genres: song.genres,
      studio: song.studio || "",
    });
  }

  async function handleSaveEdit() {
    if (!editingSong) return;
    setSavingEdit(true);
    try {
      const updated = await updateAdminSong(editingSong.id, {
        title: editForm.title,
        artist: editForm.artist,
        album: editForm.album || undefined,
        album_artist: editForm.album_artist || undefined,
        track_number: editForm.track_number ? parseInt(editForm.track_number, 10) : undefined,
        year: editForm.year ? parseInt(editForm.year, 10) : undefined,
        genres: editForm.genres,
        studio: editForm.studio || undefined,
      });
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSong(null);
    } catch (e: any) {
      setError(e.message || "Failed to update song");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleEnabled(song: Song) {
    try {
      const updated = await toggleAdminSongEnabled(song.id, !song.enabled);
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: any) {
      setError(e.message || "Failed to toggle enabled state");
    }
  }

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await deleteAdminSong(confirmModal.id);
      setSongs((prev) => prev.filter((s) => s.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete song");
    } finally {
      setDeleting(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent, song: Song) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }

  function buildMenuItems(song: Song): ContextMenuItem[] {
    return [
      {
        label: "Edit",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        onClick: () => openEditDialog(song),
      },
      {
        label: song.enabled ? "Disable" : "Enable",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {song.enabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </>
            )}
          </svg>
        ),
        onClick: () => handleToggleEnabled(song),
      },
      {
        label: "Delete",
        danger: true,
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        onClick: () => setConfirmModal({ type: "song", id: song.id, name: song.title }),
      },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Library</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search songs..."
          value={songQuery}
          onChange={(e) => { setSongQuery(e.target.value); setSongOffset(0); }}
          className="flex-1 max-w-md px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
        />
        <button
          onClick={() => setShowUploadDialog(true)}
          className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Upload Song
        </button>
        {songLoading && <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[700px]">
          <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Artwork</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Artist</th>
              <th className="px-4 py-3 font-medium">Album</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Format</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {songs.map((song) => (
              <tr
                key={song.id}
                onContextMenu={(e) => handleContextMenu(e, song)}
                className={`hover:bg-white/[0.02] transition-colors ${!song.enabled ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <ArtworkImage
                    songId={song.id}
                    title={song.title}
                    artist={song.artist}
                    className="w-10 h-10 rounded-lg object-cover bg-surface-950"
                  />
                </td>
                <td className="px-4 py-3 text-white font-medium">
                  <div className="flex items-center gap-2">
                    {song.title}
                    {!song.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-white/5">
                        Disabled
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-surface-300">{song.artist}</td>
                <td className="px-4 py-3 text-surface-400">{song.album || "—"}</td>
                <td className="px-4 py-3 text-surface-400">{formatDuration(song.duration_seconds)}</td>
                <td className="px-4 py-3 text-surface-400 uppercase">{song.file_format}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setContextMenu({
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 4,
                        song,
                      });
                    }}
                    className="text-surface-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="6" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="18" r="1.5" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {songs.length === 0 && !songLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-surface-500">
                  No songs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setSongOffset((o) => Math.max(0, o - SONG_LIMIT))}
          disabled={songOffset === 0}
          className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-surface-400">
          Showing {songs.length > 0 ? songOffset + 1 : 0}–{songOffset + songs.length}
        </span>
        <button
          onClick={() => setSongOffset((o) => o + SONG_LIMIT)}
          disabled={songs.length < SONG_LIMIT}
          className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Next
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          items={buildMenuItems(contextMenu.song)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Edit Song Dialog */}
      {editingSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Song</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-surface-400 mb-1">Title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Artist</label>
                <input
                  value={editForm.artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album</label>
                <input
                  value={editForm.album}
                  onChange={(e) => setEditForm((f) => ({ ...f, album: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album Artist</label>
                <input
                  value={editForm.album_artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, album_artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Track Number</label>
                <input
                  type="number"
                  value={editForm.track_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, track_number: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Year</label>
                <input
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div className="col-span-2">
                <MultiGenreField
                  label="Genre"
                  values={editForm.genres}
                  onChange={(v) => setEditForm((f) => ({ ...f, genres: v }))}
                  existingValues={existingGenres}
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Studio</label>
                <input
                  value={editForm.studio}
                  onChange={(e) => setEditForm((f) => ({ ...f, studio: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingSong(null)}
                disabled={savingEdit}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.title.trim() || !editForm.artist.trim()}
                className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          title="Delete Song"
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}

      {showUploadDialog && (
        <UploadSongDialog
          onClose={() => setShowUploadDialog(false)}
          onSuccess={() => loadSongs(songQuery || undefined, 0)}
        />
      )}
    </div>
  );
}
```

### Step 6.2: Commit

```bash
git add frontend/src/pages/admin/AdminLibraryPage.tsx
git commit -m "feat(admin): add Library page with song table, edit, and upload"
```

---

## Task 7: Create Admin Playlists Page

### Step 7.1: Create `AdminPlaylistsPage.tsx`

**File:** `frontend/src/pages/admin/AdminPlaylistsPage.tsx`

Extract Playlists tab logic.

```tsx
import { useState, useEffect, useCallback } from "react";
import { fetchAdminPlaylists, deleteAdminPlaylist } from "../../api/client";
import ConfirmModal from "../../components/admin/ConfirmModal";

interface AdminPlaylist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  owner_email: string;
  song_count: number;
}

export default function AdminPlaylistsPage() {
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPlaylists();
      setPlaylists(data);
    } catch (e: any) {
      setError(e.message || "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await deleteAdminPlaylist(confirmModal.id);
      setPlaylists((prev) => prev.filter((p) => p.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete playlist");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Playlists</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[600px]">
          <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Visibility</th>
              <th className="px-4 py-3 font-medium">Songs</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                  <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : (
              playlists.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-surface-300">{p.owner_email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      p.is_public
                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                        : "text-surface-400 border-white/5 bg-surface-800"
                    }`}>
                      {p.is_public ? "Public" : "Private"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-400">{p.song_count}</td>
                  <td className="px-4 py-3 text-surface-400">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmModal({ id: p.id, name: p.name })}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
            {!loading && playlists.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                  No playlists found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmModal && (
        <ConfirmModal
          title="Delete Playlist"
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
```

### Step 7.2: Commit

```bash
git add frontend/src/pages/admin/AdminPlaylistsPage.tsx
git commit -m "feat(admin): add Playlists page with moderation table"
```

---

## Task 8: Create Admin Settings Page

### Step 8.1: Create `AdminSettingsPage.tsx`

**File:** `frontend/src/pages/admin/AdminSettingsPage.tsx`

Extract Settings tab logic.

```tsx
import { useState, useEffect, useCallback } from "react";
import { fetchAdminSettings, updateAdminSetting } from "../../api/client";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<{ key: string; value: string; updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingSetting, setEditingSetting] = useState<string | null>(null);
  const [settingEditValue, setSettingEditValue] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
    } catch (e: any) {
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSaveSetting(key: string) {
    try {
      await updateAdminSetting(key, settingEditValue);
      setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value: settingEditValue } : s)));
      setEditingSetting(null);
    } catch (e: any) {
      setError(e.message || "Failed to update setting");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[500px]">
          <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                  <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : (
              settings.map((s) => (
                <tr key={s.key} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white font-mono text-xs">{s.key}</td>
                  <td className="px-4 py-3 text-surface-300">
                    {editingSetting === s.key ? (
                      <input
                        autoFocus
                        value={settingEditValue}
                        onChange={(e) => setSettingEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveSetting(s.key);
                          if (e.key === "Escape") setEditingSetting(null);
                        }}
                        className="w-full px-2 py-1 bg-surface-950 border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                      />
                    ) : (
                      s.value
                    )}
                  </td>
                  <td className="px-4 py-3 text-surface-400 text-xs">{new Date(s.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    {editingSetting === s.key ? (
                      <button
                        onClick={() => handleSaveSetting(s.key)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors"
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        onClick={() => { setEditingSetting(s.key); setSettingEditValue(s.value); }}
                        className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
            {!loading && settings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                  No settings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 8.2: Commit

```bash
git add frontend/src/pages/admin/AdminSettingsPage.tsx
git commit -m "feat(admin): add Settings page with inline editing"
```

---

## Task 9: Wire Up Routing

### Step 9.1: Update `App.tsx`

**File:** `frontend/src/App.tsx`

Replace the `/admin/*` route to use `AdminLayout` with nested `Route` elements for each admin page. Keep the permission guard (`can("admin.access")`) — it moves from `AdminDashboard` into a new `RequireAdmin` wrapper or directly into the route.

The `AdminLayout` itself should NOT do the permission check. Instead, wrap the admin routes in a `RequireAdmin` guard that checks `can("admin.access")` and shows "Access Denied" if false.

```tsx
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate, Outlet } from "react-router-dom";
// ... existing imports ...
import AdminLayout from "./components/admin/AdminLayout";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminGroupsPage from "./pages/admin/AdminGroupsPage";
import AdminLibraryPage from "./pages/admin/AdminLibraryPage";
import AdminPlaylistsPage from "./pages/admin/AdminPlaylistsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can("admin.access")) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-surface-400">You do not have permission to access the admin dashboard.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
```

Then in `AppRoutes`, replace:
```tsx
<Route path="/admin/*" element={<SetupGuard><RequireAuth><AdminDashboard /></RequireAuth></SetupGuard>} />
```

With:
```tsx
<Route path="/admin/*" element={
  <SetupGuard>
    <RequireAuth>
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    </RequireAuth>
  </SetupGuard>
}
>
  <Route index element={<AdminOverviewPage />} />
  <Route path="users" element={<AdminUsersPage />} />
  <Route path="groups" element={<AdminGroupsPage />} />
  <Route path="library" element={<AdminLibraryPage />} />
  <Route path="playlists" element={<AdminPlaylistsPage />} />
  <Route path="settings" element={<AdminSettingsPage />} />
</Route>
```

### Step 9.2: Remove Old Admin Dashboard Import

Remove the `import AdminDashboard from "./pages/admin/AdminDashboard";` line from `App.tsx`.

### Step 9.3: Commit

```bash
git add frontend/src/App.tsx
git commit -m "feat(admin): wire up admin routes with nested layout and RequireAdmin guard"
```

---

## Task 10: Remove Old Admin Dashboard

### Step 10.1: Delete `AdminDashboard.tsx`

**File:** `frontend/src/pages/admin/AdminDashboard.tsx`

Delete this file once all pages are confirmed working. It is no longer imported anywhere.

```bash
git rm frontend/src/pages/admin/AdminDashboard.tsx
git commit -m "refactor(admin): remove monolithic AdminDashboard.tsx"
```

---

## Self-Review Checklist

### Spec Coverage
| Spec Section | Plan Task |
|---|---|
| Layout shell (sidebar + topbar) | Task 1 |
| Shared components (StatCard, ConfirmModal) | Task 2 |
| Overview page (stats + quick actions) | Task 3 |
| Users page (table + role + permissions) | Task 4 |
| Groups page (two-column) | Task 5 |
| Library page (table + edit + upload) | Task 6 |
| Playlists page | Task 7 |
| Settings page | Task 8 |
| Routing with nested layout | Task 9 |
| Permission guard | Task 9 (RequireAdmin) |
| Delete old monolith | Task 10 |

### Placeholder Scan
- No "TBD", "TODO", or vague steps found.
- All code blocks contain complete implementations.
- No "similar to Task N" references.

### Type Consistency
- `Permission`, `Group`, `User`, `AdminPlaylist` types defined in each page that needs them (matching existing codebase pattern).
- `Song` type imported from `../../types` where needed.
- API function names match existing client exports.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-11-admin-redesign.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach do you prefer?
