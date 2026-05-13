# Aurora — Web App UI Kit

Click-through recreation of the Aurora Music web player, modelled after `AsP3X/aurora · frontend/src/`. Use this as a reference for designs against the Aurora brand — components are cosmetic only (no real audio, no real API).

## Run
Open `index.html` in a browser. No build step.

## Files
- `index.html` — entry. Loads React + Babel + shared CSS.
- `aurora.css` — Inter font import + colour variables + the small subset of Tailwind utilities we use (the original codebase uses Tailwind; this is a hand-rolled mirror).
- `components.jsx` — `AuroraMark`, `Icon` set, `Artwork`, `NetworkBackground`, `Topbar`, `Sidebar`, `StatCard`, `SongCard`, `PlayerBar`.
- `app.jsx` — wires the pages together: `LoginScreen` → (`Topbar` + `Sidebar` + main pane) → `LibraryPage` / `PlaylistsPage` / `PlaylistDetail` and the floating `PlayerBar`.
- `source/` — verbatim React + Vite source imported from `AsP3X/aurora`. Read it for behaviour the UI kit omits (real auth, HLS streaming, admin pages).

## What's covered
- Login screen with animated `NetworkBackground` and gradient submit
- Topbar with logo, pill search, avatar menu trigger
- Sidebar with nav, "New Playlist / Import" quick actions, your-playlists list
- Library page: 4-up stat row, "Recently Added" grid, "Recently Played" grid
- Playlists list page
- Playlist detail with hero art, gradient Play CTA, track-row table
- Liquid-glass `PlayerBar` (progress, transport, volume)

## What's intentionally stubbed
- Songs/playlists are an in-memory sample (`SAMPLE_SONGS`, `PLAYLISTS`)
- Search filters client-side instead of hitting `/api/songs`
- Audio is simulated by a 1Hz progress tick — no real playback
- Admin (`/admin/*`), Setup, Player full-page, and Artists/Albums/Genres screens are not rebuilt (they exist in `source/` for reference)
