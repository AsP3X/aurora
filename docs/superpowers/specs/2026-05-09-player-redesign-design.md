# Player Page Redesign

## Context

The Aurora music player currently renders a basic two-column layout with artwork on the left and controls on the right. The goal is to elevate it to a clean, modern, enterprise-grade experience similar to Spotify's Now Playing view — fancy, user-friendly, with clear structure.

## Goals

- Create a polished, visually premium player page
- Improve information hierarchy and readability
- Enhance interactive feedback (hover states, progress bar, buttons)
- Maintain full responsiveness across desktop, tablet, and mobile
- Keep all existing functionality intact

## Non-Goals

- Full-screen immersive mode
- Background color extraction from artwork
- Lyrics panel or queue sidebar
- Redesign of other pages (Library, Playlists, Admin)

## Architecture

Single-file refactor of `frontend/src/pages/Player.tsx`. No new components or routes. All state and API logic stays the same; only the JSX structure, Tailwind classes, and minor interaction polish change.

## Design

### Layout

Two-column layout with refined proportions:

- **Left column:** Artwork zone, `w-full md:w-96`, centered on mobile
- **Right column:** Track info + controls, flex-1 with generous spacing
- **Container:** `max-w-5xl mx-auto`, `py-12` desktop / `py-8` mobile
- **Background:** Subtle aurora glow radial gradient behind the player area for depth

### Visual System

- **Artwork:** `rounded-3xl`, `shadow-2xl shadow-black/50`, soft ambient glow via `shadow-aurora-500/20` and radial gradient backdrop
- **Typography:**
  - Title: `text-3xl md:text-4xl font-bold tracking-tight text-white`
  - Artist: `text-xl md:text-2xl font-medium text-aurora-400`
  - Album/year: `text-base text-surface-400`
  - Technical metadata: `text-xs font-mono text-surface-500`
- **Dividers:** `border-t border-white/10` between metadata and controls
- **Control group:** Subtle `bg-white/[0.02] backdrop-blur-sm rounded-2xl` wrapper

### Artwork Zone

- Full `aspect-square` container
- `ArtworkImage` component with `rounded-3xl` and `object-cover`
- On error, placeholder shows larger initial letter with soft gradient
- Ambient glow: pseudo-element or wrapper div with `radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)`

### Track Info

- Title (single line, truncate)
- Artist (single line, truncate)
- Album & year on one line: `"{album} — {year}"` or just album/year if one is missing
- Metadata pills: genre, file_format, bitrate_kbps, studio — only shown if present
  - `text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full`

### Progress Bar

- Height: `h-2`
- Three layers (bottom to top):
  1. Background: `bg-surface-800`
  2. Buffered: `bg-surface-600`
  3. Played: `bg-gradient-to-r from-aurora-500 to-aurora-400`
- Hover thumb: `w-3 h-3 bg-white rounded-full` visible on group hover
- Range input overlay: `absolute inset-0 opacity-0 cursor-pointer`
- Time labels: `flex justify-between text-xs text-surface-500 font-mono`

### Transport Controls

Centered row with the following buttons:

1. **Shuffle** (left flank): `w-10 h-10`, `text-surface-600` (disabled placeholder)
2. **Previous**: `w-12 h-12`, `text-surface-400 hover:text-white`
3. **Play/Pause**: `w-16 h-16`, `bg-gradient-to-br from-aurora-500 to-aurora-700`, `shadow-lg shadow-aurora-500/25 hover:shadow-aurora-500/40`, `hover:scale-105 active:scale-95`
4. **Next**: `w-12 h-12`, `text-surface-400 hover:text-white`
5. **Repeat** (right flank): `w-10 h-10`, `text-surface-600` (disabled placeholder)

All buttons use smooth transitions.

### Volume Control

- Speaker icon button: toggles mute (`volume === 0` restores previous volume)
- Bar: `h-1.5`, same thumb behavior as progress bar
- Label: optional small percentage text

### Loading State

Replace the small centered spinner with a full-page skeleton:
- Artwork placeholder: `aspect-square rounded-3xl bg-surface-800 animate-pulse`
- Title bar: `h-10 w-3/4 bg-surface-800 animate-pulse rounded`
- Artist bar: `h-6 w-1/2 bg-surface-800 animate-pulse rounded`
- Control bars: `h-2 w-full bg-surface-800 animate-pulse rounded`

### Responsive Behavior

- **Desktop (md+):** Two-column, artwork left, info right
- **Tablet:** Stack vertically, artwork centered at `max-w-md`
- **Mobile:** Single column, artwork full-width, larger touch targets (`min-h-[44px]`), volume below transport

### Back Button

Keep the existing back button but style it more subtly:
- `text-sm text-surface-400 hover:text-white`
- `flex items-center gap-2`
- Arrow icon with `group-hover:-translate-x-0.5`

## API & State

No changes. All existing hooks, refs, and event handlers remain:
- `audioRef`, `song`, `playing`, `progress`, `duration`, `volume`, `loading`, `buffered`
- `togglePlay`, `handleTimeUpdate`, `handleSeek`, `handleVolume`, `handleEnded`
- `formatTime`, `fetchSong`, `streamUrl`, `logHistory`

## Testing

- Manual verification of play/pause, seek, volume, and mute on desktop and mobile viewports
- Verify artwork placeholder fallback still works
- Verify loading skeleton renders correctly
- Verify responsive breakpoints (md: 768px)

## Open Questions

None. Design is fully specified.
