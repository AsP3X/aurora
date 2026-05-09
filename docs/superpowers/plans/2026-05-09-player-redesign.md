# Player Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `frontend/src/pages/Player.tsx` into a polished, Spotify-like player page with upgraded layout, typography, controls, and responsive behavior.

**Architecture:** Single-file JSX refactor. All existing React state, hooks, and API calls remain unchanged. Only the rendered structure, Tailwind classes, and minor interaction details (mute toggle, hover thumb) are modified.

**Tech Stack:** React 19, Tailwind CSS 4, TypeScript, SVG icons (inline)

---

## File Structure

- **Modify:** `frontend/src/pages/Player.tsx` — entire page layout and styling
- **No new files created.**

---

### Task 1: Add `prevVolume` state and mute toggle

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Add `prevVolume` ref/state near existing `volume` state**

Inside the `Player` component, after `const [volume, setVolume] = useState(1);`, add:

```tsx
const [prevVolume, setPrevVolume] = useState(1);
```

- [ ] **Step 2: Update volume mute toggle handler**

Replace the inline `onClick={() => setVolume(v => v === 0 ? 1 : 0)}` on the speaker icon (currently around line 173) with a handler function above the JSX return:

```tsx
function toggleMute() {
  const audio = audioRef.current;
  if (!audio) return;
  if (volume === 0) {
    const restored = prevVolume || 1;
    setVolume(restored);
    audio.volume = restored;
  } else {
    setPrevVolume(volume);
    setVolume(0);
    audio.volume = 0;
  }
}
```

- [ ] **Step 3: Update the speaker icon button to use `toggleMute`**

Change the speaker icon button's `onClick` to `toggleMute`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): add prevVolume state and proper mute toggle"
```

---

### Task 2: Redesign loading skeleton

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Replace loading spinner with full-page skeleton**

Replace the existing `if (loading)` block with:

```tsx
if (loading) {
  return (
    <div className="max-w-5xl mx-auto py-12 md:py-16">
      <div className="h-6 w-20 bg-surface-800 animate-pulse rounded mb-8" />
      <div className="flex flex-col md:flex-row gap-10 md:gap-16 items-start">
        <div className="w-full md:w-96 shrink-0">
          <div className="aspect-square rounded-3xl bg-surface-800 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="h-10 w-3/4 bg-surface-800 animate-pulse rounded" />
          <div className="h-6 w-1/2 bg-surface-800 animate-pulse rounded" />
          <div className="h-4 w-1/3 bg-surface-800 animate-pulse rounded" />
          <div className="pt-6 space-y-4">
            <div className="h-2 w-full bg-surface-800 animate-pulse rounded-full" />
            <div className="h-4 w-full bg-surface-800 animate-pulse rounded" />
            <div className="h-16 w-full bg-surface-800 animate-pulse rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): replace spinner with full-page skeleton loader"
```

---

### Task 3: Redesign main layout and artwork zone

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Update outer container and back button**

Change the outer `div` from `className="max-w-3xl mx-auto"` to:

```tsx
<div className="max-w-5xl mx-auto py-8 md:py-12">
```

Update the back button styling from `mb-8` to `mb-6 md:mb-8` and ensure it uses:

```tsx
<button
  onClick={() => navigate(-1)}
  className="flex items-center gap-2 text-sm text-surface-400 hover:text-white transition-colors mb-6 md:mb-8 group"
>
  <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
  Back
</button>
```

- [ ] **Step 2: Update layout row and artwork column**

Change the layout row from:

```tsx
<div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">
```

To:

```tsx
<div className="flex flex-col md:flex-row gap-10 md:gap-16 items-start">
```

Change the artwork wrapper from:

```tsx
<div className="w-full md:w-80 shrink-0">
  <div className="relative aspect-square rounded-2xl overflow-hidden bg-surface-900 shadow-2xl shadow-black/40">
```

To:

```tsx
<div className="w-full md:w-96 shrink-0">
  <div className="relative">
    {/* Ambient glow */}
    <div
      className="absolute -inset-4 rounded-[2rem] opacity-60 pointer-events-none"
      style={{
        background: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)",
      }}
    />
    <div className="relative aspect-square rounded-3xl overflow-hidden bg-surface-900 shadow-2xl shadow-black/50">
```

Keep the `ArtworkImage` inside as-is.

Close the new wrapper with an extra `</div>` after the existing `</div>`:

```tsx
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): redesign layout, artwork zone, and ambient glow"
```

---

### Task 4: Redesign track info section

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Replace track info block**

Replace the existing `<div className="mb-8">...</div>` inside the right column with:

```tsx
<div className="mb-6 md:mb-8">
  <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white truncate mb-2">
    {song.title}
  </h1>
  <p className="text-xl md:text-2xl font-medium text-aurora-400 truncate mb-2">
    {song.artist}
  </p>
  <p className="text-base text-surface-400 truncate">
    {song.album && song.year
      ? `${song.album} — ${song.year}`
      : song.album || (song.year ? String(song.year) : "")}
  </p>
  <div className="flex flex-wrap items-center gap-2 mt-3">
    {song.genre && (
      <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
        {song.genre}
      </span>
    )}
    <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full uppercase">
      {song.file_format}
    </span>
    {song.bitrate_kbps && (
      <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
        {song.bitrate_kbps} kbps
      </span>
    )}
    {song.studio && (
      <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
        {song.studio}
      </span>
    )}
  </div>
</div>

<div className="border-t border-white/10 mb-6 md:mb-8" />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): redesign track info with pills and divider"
```

---

### Task 5: Redesign progress bar

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Replace progress bar and time labels**

Replace the existing `<div className="space-y-4">...</div>` content (everything from the progress bar through the volume control) with the new controls section below. This is a large block — replace starting from the first `space-y-4` div inside the right column.

First, the progress bar and time labels:

```tsx
<div className="space-y-6">
  {/* Progress */}
  <div>
    <div className="relative h-2 bg-surface-800 rounded-full overflow-hidden group cursor-pointer">
      <div
        className="absolute inset-y-0 left-0 bg-surface-600 rounded-full"
        style={{ width: `${bufferedPercent}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-aurora-500 to-aurora-400 rounded-full"
        style={{ width: `${progressPercent}%` }}
      />
      {/* Hover thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ left: `calc(${progressPercent}% - 6px)` }}
      />
      <input
        type="range"
        min={0}
        max={duration || song.duration_seconds}
        value={progress}
        onChange={handleSeek}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
    <div className="flex items-center justify-between text-xs text-surface-500 font-mono mt-2">
      <span>{formatTime(progress)}</span>
      <span>{formatTime(duration || song.duration_seconds)}</span>
    </div>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): redesign progress bar with hover thumb and thicker track"
```

---

### Task 6: Redesign transport controls

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Replace transport controls row**

Replace the existing transport controls block with:

```tsx
  {/* Transport */}
  <div className="flex items-center justify-center gap-4 md:gap-6">
    {/* Shuffle (disabled placeholder) */}
    <button className="w-10 h-10 flex items-center justify-center text-surface-600 hover:text-surface-400 transition-colors" title="Shuffle">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
      </svg>
    </button>

    {/* Previous */}
    <button className="w-12 h-12 flex items-center justify-center text-surface-400 hover:text-white transition-colors">
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
    </button>

    {/* Play / Pause */}
    <button
      onClick={togglePlay}
      className="w-16 h-16 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 hover:from-aurora-400 hover:to-aurora-600 flex items-center justify-center shadow-lg shadow-aurora-500/25 hover:shadow-aurora-500/40 transition-all hover:scale-105 active:scale-95"
    >
      {playing ? (
        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
      ) : (
        <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      )}
    </button>

    {/* Next */}
    <button className="w-12 h-12 flex items-center justify-center text-surface-400 hover:text-white transition-colors">
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
    </button>

    {/* Repeat (disabled placeholder) */}
    <button className="w-10 h-10 flex items-center justify-center text-surface-600 hover:text-surface-400 transition-colors" title="Repeat">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.058M20 20v-5h-.058M4 14a8 8 0 0113.647-5.647M20 10a8 8 0 01-13.647 5.647" />
      </svg>
    </button>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): redesign transport controls with shuffle, prev, play, next, repeat"
```

---

### Task 7: Redesign volume control

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Replace volume control block**

Replace the existing volume control with:

```tsx
  {/* Volume */}
  <div className="flex items-center gap-3 pt-2">
    <button onClick={toggleMute} className="text-surface-400 hover:text-white transition-colors">
      {volume === 0 ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
      ) : volume < 0.5 ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
      )}
    </button>
    <div className="relative flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden group cursor-pointer">
      <div
        className="absolute inset-y-0 left-0 bg-surface-400 rounded-full"
        style={{ width: `${volume * 100}%` }}
      />
      {/* Hover thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ left: `calc(${volume * 100}% - 5px)` }}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={handleVolume}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
    <span className="text-xs text-surface-500 font-mono w-8 text-right">
      {Math.round(volume * 100)}%
    </span>
  </div>
</div>
```

Ensure this closes the `space-y-6` div opened in Task 5.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): redesign volume control with hover thumb and percentage label"
```

---

### Task 8: Wrap controls in subtle backdrop and test responsiveness

**Files:**
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Wrap controls in a subtle backdrop panel**

The `space-y-6` div from Task 5 should be wrapped with:

```tsx
<div className="bg-white/[0.02] backdrop-blur-sm rounded-2xl p-4 md:p-6">
```

So the structure becomes:

```tsx
<div className="bg-white/[0.02] backdrop-blur-sm rounded-2xl p-4 md:p-6 space-y-6">
  {/* Progress ... */}
  {/* Transport ... */}
  {/* Volume ... */}
</div>
```

- [ ] **Step 2: Verify responsive behavior**

Open `http://localhost:5173/player/c7ebb5f2-e8d1-4f18-a9c9-2a54d2581b7f` and test:

1. **Desktop (1280px+):** Two columns, artwork `w-96`, controls right
2. **Tablet (768px–1279px):** Stack vertically, artwork centered at `max-w-md`
3. **Mobile (<768px):** Single column, artwork full-width, controls full-width
4. **Play/Pause:** Works, hover glow visible
5. **Progress bar:** Seek works, hover thumb appears on hover
6. **Volume:** Drag works, mute/unmute restores previous volume, percentage label updates
7. **Loading:** Refresh page, verify skeleton pulses instead of spinner
8. **Back button:** Navigates back, hover arrow animation works
9. **Artwork:** Fallback placeholder shows if image errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Player.tsx
git commit -m "feat(player): wrap controls in subtle backdrop panel and verify responsiveness"
```

---

## Self-Review

**1. Spec coverage:**

| Spec Section | Task |
|---|---|
| Layout (max-w-5xl, py-12, gap-16) | Task 3 |
| Artwork glow + rounded-3xl | Task 3 |
| Typography upgrades | Task 4 |
| Metadata pills | Task 4 |
| Divider | Task 4 |
| Progress bar (h-2, hover thumb) | Task 5 |
| Transport controls (shuffle, prev, play, next, repeat) | Task 6 |
| Volume (hover thumb, percentage) | Task 7 |
| Mute toggle with prevVolume | Task 1 |
| Loading skeleton | Task 2 |
| Controls backdrop | Task 8 |
| Responsive testing | Task 8 |

**2. Placeholder scan:** No TBD, TODO, or vague steps. Every code block is complete.

**3. Type consistency:** `prevVolume` is `number`, consistent with `volume`. `toggleMute` references `audioRef` which is defined above. All Tailwind classes are from the existing `index.css` theme.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-09-player-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
