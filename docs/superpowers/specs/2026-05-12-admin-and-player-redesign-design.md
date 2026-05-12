# Admin & Player Redesign — Design Spec

## Goal
Apply the Aurora design system glass card system and responsive data cards to all admin pages and the Player page. Make admin feel like a premium "fancy enterprise" surface, not a flat data grid. Make the Player page visually stunning with aurora glow and polished transport.

## Scope
- All `/admin/*` pages: Overview, Users, Groups, Library, Playlists, Settings
- Player page (`/player/:id`) — full-screen player view
- PlayerBar (`fixed bottom`) — already has liquid glass, minor polish only
- Mobile responsiveness: tables collapse to data cards below `md`

---

## Glass Card System

Extracted from the existing `PlayerBar` liquid-glass implementation and formalized as a reusable pattern:

```
Base:   backdrop-blur-2xl bg-surface-950/35
Highlight: bg-gradient-to-b from-white/[0.12] to-white/[0.02]
Inner edge: shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]
Border: border border-white/20
Outer float: absolute -inset-1 rounded-[36px] bg-black/20 blur-xl -z-10
Corner: rounded-[32px] for floating bars, rounded-2xl for cards
```

### Tailwind utility classes to add to `index.css`

```css
@layer components {
  .glass-panel {
    @apply relative backdrop-blur-2xl bg-surface-950/35
           bg-gradient-to-b from-white/[0.12] to-white/[0.02]
           shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]
           border border-white/20 rounded-2xl;
  }
  .glass-panel::before {
    content: "";
    @apply absolute -inset-1 rounded-[24px] bg-black/20 blur-xl -z-10;
  }
}
```

---

## Shared Components

### `AdminGlassCard`
- Wraps `glass-panel` with padding (`p-5` or `p-6`)
- Optional header slot (`text-sm font-semibold text-white mb-4`)
- Hover: `hover:border-white/30 transition-colors duration-200`

### `AdminStatCard`
- Glass base + gradient icon tile (`w-12 h-12 rounded-xl`)
- Icon color matches tile gradient (aurora, emerald, amber, rose)
- Number: `text-2xl font-bold tracking-tight text-white`
- Label: `text-xs text-surface-400 uppercase tracking-wider`

### `DataTable` / `DataCardList`
- `md+`: standard `<table>` with `glass-panel` wrapper, `overflow-x-auto`
- Below `md`: stacked card layout using `AdminGlassCard` per row
- Each mobile card shows key fields + actions button
- No horizontal scroll on mobile

### `AdminEmptyState`
- Centered, no illustration (per Aurora rules)
- Icon tile (`bg-surface-900 border border-white/5 rounded-2xl`)
- Title: `text-surface-400 font-medium`
- Subtitle: `text-surface-500 text-sm`

### `AdminActionCard`
- Glass panel, icon + label centered vertically
- Hover: `hover:-translate-y-0.5 hover:border-white/30`
- Active nav on click

### `PageHeader`
- `h1`: `text-2xl font-bold text-white`
- Optional subtitle or count
- Error pill aligned right (or below on mobile)

---

## Page Designs

### Overview (`/admin`)
- **Top row:** 4 `AdminStatCard`s in grid (`grid-cols-2 lg:grid-cols-4`)
- **Below:** 2-column grid on `lg+`:
  - Left: `AdminGlassCard` with 2x2 `AdminActionCard`s (Manage Users, Browse Library, View Playlists, Edit Settings)
  - Right: `AdminGlassCard` "System Info" — key-value rows
- All cards use `glass-panel`

### Users (`/admin/users`)
- `PageHeader`: "Users" + error pill
- `DataTable`/`DataCardList`:
  - Desktop table: User (avatar + email), Role (pill), Actions (Edit/Delete)
  - Mobile cards: avatar + email, role pill, action buttons
- Edit User modal: glass overlay (`bg-black/60 backdrop-blur-sm`), glass dialog card
- Permissions modal: same glass dialog + `PermissionManager`

### Groups (`/admin/groups`)
- `PageHeader`: "Groups"
- `lg+`: 2-column — left list in glass card, right detail in glass card
- Below `lg`: single column, list first, detail below
- Group list items: glass cards with active state border

### Library (`/admin/library`)
- `PageHeader`: "Library" + search + "Upload Song" primary button
- `DataTable`/`DataCardList`:
  - Desktop: Artwork, Title (with Disabled pill), Artist, Album, Duration, Format, Actions
  - Mobile: card per song with artwork left, title/artist right, action button
- Pagination: glass buttons
- Edit Song modal: glass dialog

### Playlists (`/admin/playlists`)
- `PageHeader`: "Playlists"
- `DataTable`/`DataCardList`:
  - Desktop: Name, Owner, Songs, Visibility (pill), Created, Actions
  - Mobile: card per playlist

### Settings (`/admin/settings`)
- `PageHeader`: "Settings"
- `DataTable`/`DataCardList`:
  - Desktop: Key (mono), Value (editable inline), Updated, Actions
  - Mobile: card per setting with key, value, edit button

### Player (`/player/:id`)
- Full-screen centered layout
- Artwork: `rounded-3xl` with aurora glow behind (`radial-gradient(ellipse, rgba(139,92,246,0.15), transparent 70%)`)
- Transport controls: glass pill bar at bottom, matching PlayerBar style
- Progress bar: same liquid-glass track with aurora fill
- Volume: same style
- Time: `font-mono text-xs text-surface-500`
- Back button: top-left with glass pill background
- Genre/format chips: `bg-white/5 text-surface-400 px-2.5 py-1 rounded-full`

---

## Responsive Behavior

| Breakpoint | Layout |
|---|---|
| `md+` (768px+) | Tables display as tables. Admin sidebar visible. 2-column grids active. |
| Below `md` | Tables become stacked `AdminGlassCard` rows. Sidebar is slide-over. Single-column layouts. |

### Mobile data card pattern
Each table row becomes:
```
<AdminGlassCard>
  <div class="flex items-center gap-3">
    {leading content (artwork/avatar/icon)}
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-white">{primary}</p>
      <p class="text-xs text-surface-400">{secondary}</p>
    </div>
    {status pill / actions}
  </div>
</AdminGlassCard>
```

---

## Accessibility
- All nav items: `<Link>` with `aria-current="page"` when active
- Focus rings: `focus:outline-none focus:ring-2 focus:ring-aurora-500/50`
- Color never alone conveys meaning — icons + text for pills
- Modals trap focus and close on Escape / overlay click

---

## Out of Scope
- New backend endpoints
- Charts/graphs on Overview
- Bulk operations
- Advanced filtering beyond search
- Admin sidebar collapse-to-icons on desktop (keep full labels)
