# Admin Dashboard Redesign — Design Spec

## Goal
Redesign the admin dashboard to be clean, modern, enterprise-grade, fancy, user-friendly, and clearly structured. Move from a single-page tabbed layout to a dedicated sidebar-based multi-page admin shell.

---

## Context

The current admin lives at `/admin` as a single `AdminDashboard.tsx` page with horizontal tabs (Overview, Users, Groups, Library, Playlists, Settings). The rest of the app uses a sidebar-based `DashboardLayout` (Library, Playlists, etc.) with a music-focused sidebar (mini player, playlists, nav items).

Tech stack: React 19, React Router v7, Tailwind CSS v4, Vite, no UI component library (hand-rolled components).

---

## Architecture

### Routing
Admin gets its own route group under `/admin/*`. Each section is its own page:

| Route | Page Component | Purpose |
|---|---|---|
| `/admin` | `AdminOverviewPage` | Stats, quick actions, system info |
| `/admin/users` | `AdminUsersPage` | User directory, roles, permissions |
| `/admin/groups` | `AdminGroupsPage` | Permission groups + members |
| `/admin/library` | `AdminLibraryPage` | Song DB management |
| `/admin/playlists` | `AdminPlaylistsPage` | All playlists moderation |
| `/admin/settings` | `AdminSettingsPage` | System config key-value editing |

### Layout Shell: `AdminLayout`

A new layout component used for all `/admin/*` routes. It replaces `DashboardLayout` when in admin mode.

- **Left sidebar:** Icon + label nav items. Active state uses aurora accent. Collapsible on desktop (64px collapsed / 240px expanded), slide-over on mobile.
- **Topbar:** Aurora logo + "Admin" badge pill, search/filter slot, user avatar dropdown with "Back to Library" option.
- **Main content:** Full-width, generous padding (24px mobile, 32px desktop). No max-width constraint — admin tables need space.
- **No mini player, no playlists section.** Clean admin focus.
- **Breadcrumbs:** Subtle trail below topbar (`Home > Admin > Users`).

### Sidebar Nav Items (top to bottom)
1. Overview (chart icon)
2. Users (users icon)
3. Groups (shield icon)
4. Library (music icon)
5. Playlists (list icon)
6. Settings (cog icon)

Divider + "Back to Library" link at bottom.

---

## Visual Design

### Color Palette
Same aurora/surface tokens as main app. Emphasis shifts:
- Background: `surface-950` (page), `surface-900` (cards/panels)
- Accent: `aurora-500` (primary actions), `aurora-400` (active states)
- Status: emerald (enabled/public/online), amber (pending/warning), rose (danger/delete/error), surface-400 (disabled/private)
- Borders: `white/5` or `white/10` — never harsh
- Rounded corners: `rounded-2xl` cards, `rounded-xl` buttons/inputs, `rounded-lg` small pills

### Cards & Panels
Every section lives in a card: `bg-surface-900 border border-white/5 rounded-2xl`
- Interactive cards: `hover:border-white/10`
- Inner table headers: `bg-surface-950/50 border-b border-white/5`

### Typography
- Page titles: `text-2xl font-bold text-white`
- Section headers: `text-sm font-semibold text-white`
- Table headers: `text-xs uppercase tracking-wider text-surface-400`
- Body: `text-sm text-surface-300`
- Monospace (IDs/keys): `font-mono text-xs text-surface-400`

### Button Hierarchy
- **Primary:** `bg-aurora-600 hover:bg-aurora-500 text-white rounded-lg`
- **Secondary:** `bg-surface-800 hover:bg-surface-700 text-white border border-white/5 rounded-lg`
- **Danger:** `bg-red-600 hover:bg-red-500 text-white rounded-lg`
- **Ghost:** `text-aurora-400 hover:text-aurora-300 hover:bg-aurora-500/10`
- **Icon:** `p-2 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white`

### Loading & Empty States
- Inline spinner: `w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin`
- Empty state: centered icon + `text-surface-500 text-sm`

---

## Page Designs

### Overview (`/admin`)
- **Top row:** 4 stat cards (Users, Songs, Playlists, Storage)
- **Below:** 2-column grid:
  - Quick Actions (2x2 large buttons: Manage Users, Browse Library, View Playlists, Edit Settings)
  - System Info (key-value list)

### Users (`/admin/users`)
- Page title + search + "Add User" button (only if backend supports admin user creation; otherwise omit)
- Full-width table: User, Role (pill), Created date, Actions (3-dot menu)
- Edit User modal: email (read-only), role select, "Edit Permissions" button
- Permissions modal: `PermissionManager` + Effective Permissions chips

### Groups (`/admin/groups`)
- 2-column layout (1fr 2fr):
  - Left: "Create Group" button + group list
  - Right: group detail header + `PermissionManager` + Members section

### Library (`/admin/library`)
- Page title + search + "Upload Song" button
- Full-width table: Artwork, Title (with Disabled pill), Artist, Album, Duration, Format, Actions (3-dot menu)
- Pagination bar below
- Edit Song modal and Upload Song modal (reuse existing dialogs)

### Playlists (`/admin/playlists`)
- Page title + table: Name, Owner, Visibility (pill), Song count, Created, Actions (Delete)

### Settings (`/admin/settings`)
- Page title + table: Key (monospace), Value (inline edit), Updated, Actions

---

## Component Plan

### New Components
| Component | Purpose |
|---|---|
| `AdminLayout` | Sidebar + topbar + breadcrumbs shell |
| `AdminSidebar` | Nav items, active state, collapse toggle |
| `AdminTopbar` | Logo, badge, search slot, user dropdown |
| `Breadcrumbs` | `Home > Admin > Section` trail |
| `StatCard` | Reuse existing, but ensure consistent styling |
| `DataTable` | Reusable table wrapper with header/body/empty state |
| `ActionButton` | Primary/secondary/danger/ghost variants |
| `Badge` | Role/status pills |
| `ConfirmModal` | Reuse existing, verify styling match |
| `PageHeader` | Title + actions slot |

### Pages (new files)
- `pages/admin/AdminOverviewPage.tsx`
- `pages/admin/AdminUsersPage.tsx`
- `pages/admin/AdminGroupsPage.tsx`
- `pages/admin/AdminLibraryPage.tsx`
- `pages/admin/AdminPlaylistsPage.tsx`
- `pages/admin/AdminSettingsPage.tsx`

### Refactored
- `pages/admin/AdminDashboard.tsx` → becomes the tab content, logic extracted into pages. Can be deleted once pages are complete.

---

## Data Flow

No backend changes. All API calls remain the same:
- `fetchAdminStats`, `fetchUsers`, `fetchGroups`, `fetchPermissions`, etc.
- Each page loads its own data in `useEffect`.
- Shared state (e.g., permissions list) can be lifted to `AdminLayout` context if needed, but start simple — each page fetches independently.

---

## Responsive Behavior

- **Desktop (>= 1024px):** Sidebar expanded (240px). Two-column layouts on Overview and Groups.
- **Tablet (768px - 1023px):** Sidebar collapses to icons only (64px). Single-column layouts.
- **Mobile (< 768px):** Sidebar is a slide-over drawer. Tables scroll horizontally. Cards stack vertically.

---

## Accessibility

- All nav items are `<Link>` with `aria-current="page"` when active.
- Focus rings: `focus:outline-none focus:ring-2 focus:ring-aurora-500/50`
- Color alone never conveys meaning — icons + text for status pills.
- Tables use semantic `<thead>`/`<tbody>`.
- Modals trap focus and close on Escape.

---

## Testing

- Verify each route renders the correct page.
- Verify sidebar active state updates on navigation.
- Verify mobile sidebar opens/closes.
- Verify all existing admin operations still work (CRUD users, groups, songs, playlists, settings).
- Verify permission checks (`can("admin.access")`) still gate the admin area.

---

## Out of Scope

- New backend endpoints or API changes.
- Audit log / activity feed.
- Charts/graphs on Overview (keep it stats cards only for now).
- Bulk operations on tables.
- Advanced filtering beyond basic search.
