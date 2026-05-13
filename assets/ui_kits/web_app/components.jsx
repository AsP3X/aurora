// Aurora UI Kit — Shared components (Sidebar, Topbar, PlayerBar, NetworkBackground, SongCard, StatCard)
// Recreations of components from AsP3X/aurora · frontend/src/components
const { useEffect, useRef, useState } = React;

/* ─── Brand mark ─── */
function AuroraMark({ size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px rgba(139,92,246,0.25)' }}>
      <svg width={size * 0.5} height={size * 0.5} fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    </div>
  );
}

/* ─── Icons ─── */
const Icon = {
  Library:  ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
  Playlist: ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>,
  Artist:   ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  Album:    ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  Genres:   ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>,
  Clock:    ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Search:   ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>,
  Plus:     ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>,
  Upload:   ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
  Play:     ({ size = 16 }) => <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>,
  Pause:    ({ size = 16 }) => <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>,
  Prev:     ({ size = 16 }) => <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>,
  Next:     ({ size = 16 }) => <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>,
  Vol:      ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>,
  Chevron:  ({ size = 12 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>,
  X:        ({ size = 16 }) => <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
};

/* ─── Generated artwork (deterministic gradient from id) ─── */
function Artwork({ id, title, size = 160, rounded = 12 }) {
  const palettes = [
    ['#4c1d95','#db2777','#f97316'],
    ['#0ea5e9','#1e40af','#0f172a'],
    ['#7c3aed','#a21caf','#831843'],
    ['#10b981','#0891b2','#1e3a8a'],
    ['#f59e0b','#dc2626','#4c1d95'],
    ['#8b5cf6','#3b82f6','#06b6d4'],
    ['#0f766e','#065f46','#1f2937'],
    ['#be185d','#7c3aed','#1e1b4b'],
  ];
  const h = [...(id || title || '?')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const p = palettes[h % palettes.length];
  const initial = (title || '?').trim()[0]?.toUpperCase() || '♪';
  return (
    <div style={{ width: size, height: size, borderRadius: rounded, background: `linear-gradient(${135 + (h % 50)}deg, ${p[0]}, ${p[1]} 55%, ${p[2]})`, position: 'relative', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,0.05)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.30), transparent 50%)' }} />
      <div style={{ position: 'absolute', right: 8, bottom: 8, fontFamily: 'Inter', fontWeight: 800, fontSize: size * 0.32, color: 'rgba(255,255,255,0.18)', lineHeight: 1 }}>{initial}</div>
    </div>
  );
}

/* ─── NetworkBackground ─── */
function NetworkBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const x = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() { c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; x.setTransform(dpr,0,0,dpr,0,0); }
    size();
    const N = 70, P = [], W = () => c.offsetWidth, H = () => c.offsetHeight;
    for (let i=0;i<N;i++) P.push({x:Math.random()*W(),y:Math.random()*H(),vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,r:Math.random()*1.5+1.4});
    let raf, mouse = { x: -1000, y: -1000 };
    function loop() {
      x.clearRect(0,0,W(),H());
      for (const p of P) { p.x += p.vx; p.y += p.vy; if (p.x<0||p.x>W()) p.vx*=-1; if (p.y<0||p.y>H()) p.vy*=-1; }
      for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) {
        const a=P[i],b=P[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
        if (d<160) { const o=(1-d/160)*0.45; x.strokeStyle=`rgba(167,139,250,${o})`; x.lineWidth=1.2; x.beginPath(); x.moveTo(a.x,a.y); x.lineTo(b.x,b.y); x.stroke(); }
      }
      for (const p of P) {
        const dx=p.x-mouse.x,dy=p.y-mouse.y,d=Math.hypot(dx,dy);
        if (d<200) { const o=(1-d/200)*0.55; x.strokeStyle=`rgba(216,200,255,${o})`; x.lineWidth=1.4; x.beginPath(); x.moveTo(p.x,p.y); x.lineTo(mouse.x,mouse.y); x.stroke(); }
        x.beginPath(); x.arc(p.x,p.y,p.r,0,Math.PI*2); x.fillStyle='rgba(216,200,255,0.9)'; x.fill();
        x.beginPath(); x.arc(p.x,p.y,p.r*3,0,Math.PI*2); x.fillStyle='rgba(167,139,250,0.15)'; x.fill();
      }
      raf = requestAnimationFrame(loop);
    }
    loop();
    function mm(e){ const r=c.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; }
    window.addEventListener('mousemove', mm);
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', mm); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
}

/* ─── Topbar ─── */
function Topbar({ search, setSearch, user, onMenu }) {
  return (
    <div style={{ height: 64, background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'relative', zIndex: 30, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AuroraMark size={32} />
        <span style={{ fontWeight: 700, letterSpacing: '-0.015em', fontSize: 16 }}>Aurora</span>
      </div>
      <div style={{ flex: 1, maxWidth: 560, margin: '0 32px', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--surface-500)' }}><Icon.Search /></div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search songs, artists, albums…" style={{ width: '100%', height: 40, background: 'var(--surface-900)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9999, padding: '0 16px 0 40px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 9999, background: 'var(--surface-900)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
        <div style={{ width: 28, height: 28, borderRadius: 9999, background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{user[0].toUpperCase()}</div>
        <span style={{ fontSize: 12, color: 'var(--surface-300)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</span>
        <span style={{ color: 'var(--surface-500)' }}><Icon.Chevron /></span>
      </div>
    </div>
  );
}

/* ─── Sidebar ─── */
function Sidebar({ active, onNav, playlists, onNewPlaylist }) {
  const items = [
    { id: 'library', label: 'Library', Ico: Icon.Library },
    { id: 'playlists', label: 'Playlists', Ico: Icon.Playlist },
    { id: 'artists', label: 'Artists', Ico: Icon.Artist, soon: true },
    { id: 'albums', label: 'Albums', Ico: Icon.Album, soon: true },
    { id: 'genres', label: 'Genres', Ico: Icon.Genres, soon: true },
  ];
  return (
    <aside style={{ width: 256, background: 'rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it) => (
          <NavItem key={it.id} active={active === it.id && !it.soon} soon={it.soon} onClick={() => !it.soon && onNav(it.id)} Ico={it.Ico} label={it.label} />
        ))}
      </div>
      <div style={{ margin: '0 16px', height: 1, background: 'rgba(255,255,255,0.05)' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onNewPlaylist} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(26,24,34,0.6)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--surface-300)', fontSize: 13, cursor: 'pointer' }}>
          <Icon.Plus /> New Playlist
        </button>
        <button disabled style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(26,24,34,0.6)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--surface-500)', fontSize: 13, cursor: 'not-allowed' }}>
          <Icon.Upload /> Import Music
        </button>
      </div>
      <div style={{ margin: '0 16px', height: 1, background: 'rgba(255,255,255,0.05)' }} />
      <div style={{ padding: 16, flex: 1, overflow: 'auto', minHeight: 0 }} className="scrollbar">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--surface-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Your Playlists</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {playlists.map((p) => (
            <a key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--surface-300)' }}
               onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
               onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-900)', border: '1px solid rgba(255,255,255,0.05)', display: 'grid', placeItems: 'center', color: 'var(--surface-500)', flexShrink: 0 }}><Icon.Playlist /></div>
              <span className="truncate">{p.name}</span>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

function NavItem({ active, soon, onClick, Ico, label }) {
  if (soon) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, color: 'var(--surface-600)', cursor: 'not-allowed', fontSize: 13 }}>
      <Ico /> <span>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--surface-700)', border: '1px solid rgba(79,74,102,0.3)', padding: '2px 6px', borderRadius: 4 }}>Soon</span>
    </div>;
  }
  return <a onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: active ? 'rgba(255,255,255,0.10)' : 'transparent', color: active ? '#fff' : 'var(--surface-400)', transition: 'all 150ms' }}>
    <span style={{ color: active ? 'var(--aurora-400)' : 'var(--surface-500)' }}><Ico /></span>{label}
  </a>;
}

/* ─── StatCard ─── */
function StatCard({ label, value, Ico, tint }) {
  const tints = {
    aurora: { bg: 'rgba(124,58,237,0.20)', fg: 'var(--aurora-400)' },
    rose:   { bg: 'rgba(244,63,94,0.20)',  fg: '#fb7185' },
    amber:  { bg: 'rgba(245,158,11,0.20)', fg: '#fbbf24' },
    emer:   { bg: 'rgba(16,185,129,0.20)', fg: '#34d399' },
  }[tint];
  return (
    <div style={{ background: 'var(--surface-900)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: tints.bg, color: tints.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Ico size={22} /></div>
      <div>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>{value}</p>
        <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      </div>
    </div>
  );
}

/* ─── SongCard ─── */
function SongCard({ song, onPlay }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={() => onPlay(song)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ cursor: 'pointer', padding: 8, borderRadius: 12, background: hover ? 'rgba(26,24,34,0.4)' : 'transparent', transition: 'all 200ms', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative' }}>
        <Artwork id={song.id} title={song.title} size={'100%'} rounded={12} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: hover ? 'rgba(0,0,0,0.30)' : 'transparent', display: 'grid', placeItems: 'center', transition: 'all 200ms' }}>
          <div style={{ width: 40, height: 40, borderRadius: 9999, background: 'rgba(124,58,237,0.90)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(0,0,0,0.30)', opacity: hover ? 1 : 0, transition: 'opacity 200ms' }}>
            <span style={{ color: '#fff', marginLeft: 2 }}><Icon.Play size={18} /></span>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 4px' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: hover ? 'var(--aurora-300)' : '#fff', transition: 'color 200ms' }} className="truncate">{song.title}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--surface-400)' }} className="truncate">{song.artist}</p>
      </div>
    </div>
  );
}

/* ─── PlayerBar (liquid glass) ─── */
function PlayerBar({ song, isPlaying, onToggle, progress, duration, onSeek, volume, onVolume }) {
  if (!song) return null;
  const pct = duration ? (progress / duration) * 100 : 0;
  const fmt = (s) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  return (
    <div style={{ position: 'fixed', left: 272, right: 16, bottom: 16, zIndex: 40 }}>
      <div style={{ position: 'relative', borderRadius: 32, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(24px)', background: 'rgba(15,14,20,0.35)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))' }} />
        <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.15)', borderRadius: 32 }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 32, border: '1px solid rgba(255,255,255,0.20)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: -4, borderRadius: 36, background: 'rgba(0,0,0,0.20)', filter: 'blur(20px)', zIndex: -1 }} />
        <div style={{ position: 'relative', padding: '12px 20px' }}>
          {/* Progress bar */}
          <div style={{ position: 'relative', height: 10, marginBottom: 8, cursor: 'pointer' }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration); }}>
            <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 6, background: 'rgba(38,34,46,0.6)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)', borderRadius: 999, boxShadow: '0 0 10px rgba(139,92,246,0.45)' }} />
            </div>
            <div style={{ position: 'absolute', top: '50%', left: `calc(${pct}% - 5px)`, transform: 'translateY(-50%)', width: 10, height: 10, background: '#fff', borderRadius: 999, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ flexShrink: 0 }}><Artwork id={song.id} title={song.title} size={48} rounded={12} /></div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }} className="truncate">{song.title}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.65)' }} className="truncate">{song.artist}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button style={btnIcon}><Icon.Prev size={18} /></button>
              <button onClick={onToggle} style={{ width: 40, height: 40, borderRadius: 9999, background: 'rgba(255,255,255,0.92)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.30)', border: 'none', cursor: 'pointer', color: 'var(--surface-950)' }}>
                {isPlaying ? <Icon.Pause size={18} /> : <span style={{ marginLeft: 2 }}><Icon.Play size={18} /></span>}
              </button>
              <button style={btnIcon}><Icon.Next size={18} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.55)' }}>
              <span style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>{fmt(progress)} / {fmt(duration)}</span>
              <Icon.Vol size={14} />
              <div style={{ width: 80, height: 4, background: 'rgba(38,34,46,0.6)', borderRadius: 999, position: 'relative', cursor: 'pointer' }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onVolume((e.clientX - r.left) / r.width); }}>
                <div style={{ position: 'absolute', inset: 0, width: `${volume * 100}%`, background: 'var(--surface-400)', borderRadius: 999 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
const btnIcon = { width: 36, height: 36, borderRadius: 9999, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', display: 'grid', placeItems: 'center', cursor: 'pointer' };

Object.assign(window, { AuroraMark, Icon, Artwork, NetworkBackground, Topbar, Sidebar, NavItem, StatCard, SongCard, PlayerBar });
