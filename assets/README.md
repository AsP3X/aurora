# Aurora Design System

> Dark-first, purple-accented design system for **Aurora** — a self-hosted music streaming service with a clean, modern, "fancy enterprise" feel.

## Sources

- **Codebase:** `AsP3X/aurora` @ `master` (imported into this project under `ui_kits/web_app/source/`)
  - Frontend: React 19 + Vite + Tailwind v4 + TypeScript
  - Backend: Rust + Axum + SQLite/Postgres + Meilisearch (not consumed here)
- **Logo / favicon:** `frontend/public/favicon.svg` → `assets/aurora-logo.svg`
- **Hero asset:** `frontend/src/assets/hero.png` → `assets/hero.png`

## Product

Aurora is a self-hosted music streaming server with a web player UI. The frontend serves two user surfaces from one React SPA:

1. **Listener app** — `/` Library dashboard, `/playlists`, `/playlist/:id`, `/player/:id`. Sidebar + search-driven library, glassy floating player bar, album-art-first browsing.
2. **Admin console** — `/admin/*` with sub-routes for Overview, Users, Groups, Library, Playlists, Settings. Same dark surface, sidebar nav with aurora-tinted active rail.

A first-run **Setup** flow and a **Login/Register** page round out the public surface. Login uses the "Network Background" — animated violet dots and connecting lines drawn on canvas — as a signature brand moment.

---

## Index

| File | Purpose |
|---|---|
| `README.md` | This document — context, content, visual foundations, iconography. |
| `colors_and_type.css` | CSS variables for color tokens, type scale, spacing, radii, shadows, gradients, and semantic classes. |
| `SKILL.md` | Cross-compatible Agent Skill manifest for Claude Code. |
| `assets/` | `aurora-logo.svg`, `hero.png`. |
| `preview/` | Design-system specimen cards (registered to the Design System tab). |
| `ui_kits/web_app/` | Hi-fi click-thru recreation of the Aurora web player + `source/` (imported React code from `AsP3X/aurora`). |

---

## CONTENT FUNDAMENTALS

### Voice & tone
Aurora speaks like a **calm, modern product**. Sentences are short. Labels are direct. No exclamation marks except in single-word success ("Success!"). It addresses the user as **"you"** ("Sign in to access your library", "Start your music journey today") and never refers to itself in the first person.

### Casing
- **Title Case** for headings, buttons, and nav items: `Recently Added`, `New Playlist`, `Sign in`, `Manage Users`, `Quick Actions`.
- **UPPERCASE + wide letter-spacing** for tiny eyebrow labels above stat cards: `TOTAL SONGS`, `ARTISTS`, `STORAGE USED`.
- **Sentence case** in helper text and form fields: "Enter your password", "Search songs, artists, albums…".

### Microcopy patterns
| Context | Pattern | Example |
|---|---|---|
| Empty state | One short sentence, no CTA noise | "No songs in the library yet." · "No playlists yet" |
| Loading | Single verb + ellipsis | "Loading dashboard…" · "Signing in…" · "Creating account…" |
| Errors | Plain language, no "Oops" | "Authentication failed" · "Failed to load stats" |
| Success | Optimistic, forward-looking | "Account created successfully! Signing you in…" |
| Disabled (coming soon) | `Soon` pill on the row | Artists · Albums · Genres in the sidebar |
| Stats | Number first, label underneath | `1,284` / `TOTAL SONGS` |

### Vibe
**Premium, minimal, slightly nocturnal.** No marketing-speak, no emoji, no exclamatory CTAs. Copy feels written by an engineer who cares about typography. The product name is always "**Aurora**" or "**Aurora Music**" — never "Aurora Music Streaming" or similar.

---

## VISUAL FOUNDATIONS

### Color
- **Foundation is dark**: page is `--surface-950` (`#0f0e14`), a near-black with a slight violet undertone. Body text is `#e8e6f0`.
- **Primary accent is `aurora-500` (`#8b5cf6`)** — used as the active-nav indicator, focus ring, brand gradient endpoint, and play-button fill. Hover/press deepen to `aurora-600/700`.
- **Surfaces step up via translucent whites**, not lighter solid greys: cards use `bg-surface-900` with `border-white/5`; floating panels use `backdrop-blur-2xl` + `bg-white/5` + `border-white/10`.
- **Status uses tinted backgrounds**: `bg-emerald-500/20` / `text-emerald-400` for success, `bg-amber-500/20` for warnings, `bg-rose-500/20` / `bg-red-500/10` for danger. Never solid colors.
- **Selection** is `rgba(139,92,246,0.35)` — a violet wash, never the OS blue.

### Type
- **Inter** (300/400/500/600/700/800) loaded from Google Fonts is the only family. No serif, no mono outside of timecodes (`tabular-nums`, sometimes mono-styled).
- Headings tighten letter-spacing: `tracking-tight` (~-0.02em).
- Tiny eyebrow labels widen letter-spacing: `uppercase tracking-wider` + `text-xs`.
- Numbers in stat cards are `text-2xl font-bold tracking-tight`. Timecodes use `font-mono text-[11px] text-surface-500`.

### Spacing & rhythm
4px base scale. Component padding clusters around **12 / 16 / 20 / 24px**. Cards: `p-5`. Forms: `space-y-5`. Page gutters: `px-4 sm:px-6 lg:px-8`. Sidebar width: `w-64` (256px). Topbar height: `h-16` (64px).

### Backgrounds & atmosphere
- The default canvas is solid `--surface-950`, **no gradient**, no texture.
- The **Login** page is the brand moment: `<NetworkBackground>` paints a constellation of violet dots and lines on a canvas (90 particles, 180px connection distance, mouse-reactive). On top of that, a vertical protection gradient (`from-surface-950/20 via-transparent to-surface-950/60`) keeps the form readable, and an `.aurora-glow` radial bleeds purple from the top.
- The Player page artwork sits in a soft halo: `radial-gradient(ellipse, rgba(139,92,246,0.15), transparent 70%)` `-inset-4` behind the album cover.
- No hand-drawn illustrations, no repeating patterns, no grain. Album artwork is the only "imagery" in the product.

### Animation & motion
- **Tone is restrained.** Almost everything uses `transition-colors`, `transition-shadow`, or `transition-all` with no explicit duration (Tailwind default 150ms) — sometimes `duration-200` or `duration-300`.
- The hover bump on artwork is `group-hover:scale-105` over `duration-300`.
- Press states: `active:scale-95` on the main play button and pill buttons.
- Loaders use a single spinner: `w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin`.
- The progress bar's filled width animates `duration-300 ease-linear`. No spring, no bounce, no parallax.

### Hover, press, focus states
- **Hover (text)**: `text-surface-300 → text-white` or `text-surface-400 → text-aurora-300`.
- **Hover (surface)**: add `bg-white/5` or `bg-white/10`; borders go `border-white/5 → border-white/10`.
- **Hover (artwork)**: scale-up + darken overlay + reveal a play-circle in the center.
- **Press**: `active:scale-95` for icon-buttons; `active:scale-97` for primary buttons.
- **Focus**: `focus:ring-1 focus:ring-aurora-500/50 focus:border-aurora-500/30` (or `focus:ring-2` for forms). Never an OS outline.

### Borders, shadows, glass
- Default border is **`rgba(255,255,255,0.05)`** — almost invisible, but enough to separate dark cards on a darker page.
- Cards use no shadow at rest; floating elements use `shadow-2xl shadow-black/50` or the purple glow `shadow-aurora-500/20`.
- **Glass system** (floating player bar, mobile menus, sticky headers):
  1. `backdrop-blur-2xl`
  2. `bg-surface-950/35` base + `bg-gradient-to-b from-white/[0.12] to-white/[0.02]` highlight
  3. `shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]` inner-light edge
  4. `border border-white/20` outer line
  5. Outer drop shadow `bg-black/20 blur-xl -z-10` floats it
- The aurora **glow** (`radial-gradient ellipse at 50% 0%, rgba(124,58,237,0.12), transparent 60%`) is the brand's signature ambient effect.

### Layout rules
- Sticky top header with `backdrop-blur-2xl bg-white/5` when off-dashboard.
- Sidebar is **fixed**, not sticky. Mobile collapses behind a `bg-black/50 backdrop-blur-sm` overlay.
- Floating player bar is `fixed bottom-4` with `left-4/8/72` offsets responsive to the sidebar.
- Max content width: `max-w-7xl mx-auto`.

### Transparency & blur
- Used **everywhere** for hierarchy: every "floating" panel is translucent over the dark page.
- Never blur over photographic backgrounds — only over the dark canvas.
- Subtitle/meta opacity: `text-surface-400`. Disabled: `text-surface-600` with `cursor-not-allowed`.

### Corner radii
- Buttons & inputs: **`rounded-xl`** (12px) or `rounded-full` for pill toggles.
- Cards & elevated panels: **`rounded-2xl`** (16px).
- Album art / hero artwork: **`rounded-3xl`** (24px); large floating player: **`rounded-[32px]`**.
- Search box, chips, user-menu trigger: **`rounded-full`**.

### Card anatomy
`bg-surface-900` (or `bg-surface-900/50` over glow) · `border border-white/5` · `rounded-2xl` · `p-5` · optional hover `hover:border-white/10`. Stat-card variant adds a colored icon tile on the left: `w-12 h-12 rounded-xl bg-aurora-600/20 text-aurora-400`.

---

## ICONOGRAPHY

Aurora ships **no built-in icon font and no SVG sprite of its own** (the `frontend/public/icons.svg` in the repo is unrelated boilerplate — Bluesky/Discord/GitHub/X glyphs left over from a template). All product icons are **inline `<svg>`** drawn with **`stroke="currentColor" strokeWidth={2}` 24×24 viewBox** — equivalent to the **Heroicons outline** set. A handful of icons use `fill="currentColor"` (the speaker-bar play/pause/prev/next triangles, the music-note logo).

### Conventions
- **Stroke width 2** for nav/UI icons (`w-4 h-4` typical).
- **Stroke width 1.5** for larger "quick action" tile icons (`w-6 h-6`).
- **Stroke width 2.5** for the logo glyph inside its gradient tile.
- Color: `text-surface-500` at rest, `text-aurora-400` when active, `text-white` on hover.
- Always wrapped in fixed-size containers so layout doesn't shift.

### Logo
The favicon (`assets/aurora-logo.svg`) is a stylized purple **lightning-bolt "A"** with a soft glow. In-app the brand mark is a **music-note** glyph inside a `bg-gradient-to-br from-aurora-500 to-aurora-700 rounded-lg` tile (the `App.tsx` header pattern). Two glyphs coexist:
- **Favicon / external** → lightning-A SVG.
- **In-app brand mark** → music-note in a gradient tile + the wordmark "Aurora" / "Aurora Music" in `font-bold tracking-tight`.

### Emoji & unicode
- **Never used** anywhere in the product copy or UI. No `🎵` shortcuts.
- Unicode dashes (`—`, `…`) are used in copy.

### Substitution policy
If you need an icon Aurora doesn't ship, pull from **Heroicons v2 (outline)** — it's the visual sibling of every inline path in the codebase. Stroke 2, 24×24, rounded line caps. Falling back to Lucide is acceptable for novel glyphs (same stroke weight, same feel).

---

## VARIATIONS / CAVEATS

- **No proprietary font** — Inter ships from Google Fonts. No substitution needed.
- The repo's `public/icons.svg` is **template boilerplate** unrelated to the music product; it is NOT imported. Aurora's real iconography is inline SVG per the codebase.
- No marketing site exists in the repo — only the app UI. Sample slides have therefore been omitted.
