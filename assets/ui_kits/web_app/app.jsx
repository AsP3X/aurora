// Aurora UI Kit — App shell that wires Login → Library → Playlist → Player together
const { useState, useEffect, useMemo } = React;

const SAMPLE_SONGS = [
  { id: 's1',  title: 'Northern Light',   artist: 'Adriana Voss',     album: 'Solar Tides',        duration: 224 },
  { id: 's2',  title: 'Glasswater',       artist: 'Kele Mori',        album: 'Glassworks III',     duration: 198 },
  { id: 's3',  title: 'Cassini Drift',    artist: 'Pillar Forest',    album: 'Outer Bodies',       duration: 312 },
  { id: 's4',  title: 'Slow Aperture',    artist: 'Nia Ekko',         album: 'Polaroids',          duration: 186 },
  { id: 's5',  title: 'Halo Effect',      artist: 'Sister Plateau',   album: 'Telemetry',          duration: 242 },
  { id: 's6',  title: 'Verdigris',        artist: 'Adriana Voss',     album: 'Solar Tides',        duration: 268 },
  { id: 's7',  title: 'Lo-Fi Stratos',    artist: 'Pillar Forest',    album: 'Outer Bodies',       duration: 174 },
  { id: 's8',  title: 'Atrium',           artist: 'Kele Mori',        album: 'Glassworks III',     duration: 209 },
  { id: 's9',  title: 'Echo Park West',   artist: 'Marlow & The Cur', album: 'Bel-Air B-Sides',    duration: 251 },
  { id: 's10', title: 'Subtropic',        artist: 'Nia Ekko',         album: 'Polaroids',          duration: 192 },
  { id: 's11', title: 'Daughter of Tide', artist: 'Sister Plateau',   album: 'Telemetry',          duration: 287 },
  { id: 's12', title: 'Aurora (theme)',   artist: 'Various Artists',  album: 'Compilations',       duration: 158 },
];

const PLAYLISTS = [
  { id: 'pl1', name: 'Late night focus',   songs: ['s2','s4','s8','s10'] },
  { id: 'pl2', name: 'Sunday drive',       songs: ['s1','s5','s6','s9','s11'] },
  { id: 'pl3', name: 'New & Approved',     songs: ['s3','s7','s12'] },
  { id: 'pl4', name: 'Adriana — complete', songs: ['s1','s6'] },
  { id: 'pl5', name: 'Pillar Forest deep', songs: ['s3','s7'] },
];

function fmt(s){ const m=Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function fmtTotal(s){ const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; }

/* ─── Login screen ─── */
function LoginScreen({ onSignIn }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('demo@aurora.fm');
  const [pwd, setPwd]     = useState('••••••••');
  return (
    <div className="aurora-glow" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, position: 'relative', overflow: 'hidden' }}>
      <NetworkBackground />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,14,20,0.20), transparent, rgba(15,14,20,0.60))', zIndex: 1, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 40 }}>
          <AuroraMark size={40} />
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em' }}>Aurora Music</span>
        </div>
        <div style={{ background: 'rgba(26,24,34,0.50)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 32, boxShadow: '0 24px 50px rgba(0,0,0,0.40)' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, textAlign: 'center', letterSpacing: '-0.015em' }}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p style={{ margin: '8px 0 32px', fontSize: 13, color: 'var(--surface-400)', textAlign: 'center' }}>{mode === 'signin' ? 'Sign in to access your library' : 'Start your music journey today'}</p>
          <form onSubmit={(e) => { e.preventDefault(); onSignIn(email); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Field label="Email" value={email} onChange={setEmail} type="email" />
            <Field label="Password" value={pwd} onChange={setPwd} type="password" />
            <button type="submit" style={{ padding: '10px 16px', background: 'linear-gradient(90deg, #7c3aed, #6d28d9)', color: '#fff', fontWeight: 500, fontSize: 14, border: 'none', borderRadius: 12, boxShadow: '0 8px 20px rgba(139,92,246,0.25)', cursor: 'pointer', marginTop: 4 }}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--surface-400)' }}>
              {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
              <a onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')} style={{ color: 'var(--aurora-400)', fontWeight: 500, cursor: 'pointer' }}>{mode === 'signin' ? 'Create one' : 'Sign in'}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
function Field({ label, value, onChange, type='text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--surface-300)', marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} style={{ width: '100%', padding: '10px 14px', background: 'var(--surface-950)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, color: '#fff', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }} />
    </div>
  );
}

/* ─── Library page ─── */
function LibraryPage({ onPlay, search }) {
  const songs = useMemo(() => SAMPLE_SONGS.filter(s =>
    !search || (s.title+s.artist+s.album).toLowerCase().includes(search.toLowerCase())
  ), [search]);
  const isSearching = search && search.trim().length > 0;
  return (
    <div className="fade-in">
      {!isSearching && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          <StatCard label="Total Songs" value="12,034" Ico={Icon.Playlist} tint="aurora" />
          <StatCard label="Artists"     value="823"    Ico={Icon.Artist}   tint="rose"   />
          <StatCard label="Albums"      value="1,432"  Ico={Icon.Album}    tint="amber"  />
          <StatCard label="Total Duration" value="802h" Ico={Icon.Clock}   tint="emer"   />
        </div>
      )}
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>{isSearching ? `Search results for "${search}"` : 'Recently Added'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
        {songs.map((s) => <SongCard key={s.id} song={s} onPlay={onPlay} />)}
      </div>
      {!isSearching && <>
        <h2 style={{ margin: '32px 0 16px', fontSize: 18, fontWeight: 600 }}>Recently Played</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
          {SAMPLE_SONGS.slice(0, 6).reverse().map((s) => <SongCard key={s.id} song={s} onPlay={onPlay} />)}
        </div>
      </>}
    </div>
  );
}

/* ─── Playlists list ─── */
function PlaylistsPage({ onOpen }) {
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Your Playlists</h2>
        <span style={{ fontSize: 12, color: 'var(--surface-500)' }}>{PLAYLISTS.length} playlists</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {PLAYLISTS.map((p) => (
          <div key={p.id} onClick={() => onOpen(p.id)} style={{ background: 'var(--surface-900)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 12, cursor: 'pointer' }}>
            <Artwork id={p.id} title={p.name} size={'100%'} rounded={12} />
            <div style={{ padding: '12px 4px 4px' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }} className="truncate">{p.name}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--surface-400)' }}>{p.songs.length} songs</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Playlist detail ─── */
function PlaylistDetail({ id, onPlay }) {
  const pl = PLAYLISTS.find(p => p.id === id);
  if (!pl) return null;
  const songs = pl.songs.map(sid => SAMPLE_SONGS.find(s => s.id === sid));
  const total = songs.reduce((a, s) => a + s.duration, 0);
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', marginBottom: 32 }}>
        <div style={{ width: 220, flexShrink: 0 }}><Artwork id={pl.id} title={pl.name} size={'100%'} rounded={24} /></div>
        <div style={{ flex: 1, paddingBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--surface-400)' }}>Playlist</p>
          <h1 style={{ margin: '8px 0 12px', fontSize: 48, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05 }}>{pl.name}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--surface-400)' }}>{songs.length} songs · {fmtTotal(total)}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={() => onPlay(songs[0])} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(90deg, #7c3aed, #6d28d9)', border: 'none', color: '#fff', borderRadius: 9999, fontSize: 13.5, fontWeight: 500, boxShadow: '0 8px 20px rgba(139,92,246,0.25)', cursor: 'pointer' }}>
              <Icon.Play size={14} /> Play
            </button>
            <button style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', borderRadius: 9999, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Shuffle</button>
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--surface-900)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', gap: 16, padding: '12px 20px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--surface-500)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span>#</span><span>Title</span><span>Album</span><span style={{ textAlign: 'right' }}>Time</span>
        </div>
        {songs.map((s, i) => (
          <Row key={s.id} i={i+1} s={s} onPlay={() => onPlay(s)} />
        ))}
      </div>
    </div>
  );
}
function Row({ i, s, onPlay }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onPlay} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', gap: 16, padding: '10px 20px', alignItems: 'center', background: hover ? 'rgba(255,255,255,0.03)' : 'transparent', cursor: 'pointer' }}>
      <span style={{ fontSize: 13, color: 'var(--surface-500)' }}>{hover ? <Icon.Play size={14} /> : i}</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
        <Artwork id={s.id} title={s.title} size={36} rounded={6} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }} className="truncate">{s.title}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--surface-400)' }} className="truncate">{s.artist}</p>
        </div>
      </div>
      <span style={{ fontSize: 13, color: 'var(--surface-400)' }} className="truncate">{s.album}</span>
      <span style={{ fontSize: 12, color: 'var(--surface-500)', textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }}>{fmt(s.duration)}</span>
    </div>
  );
}

/* ─── Root app ─── */
function App() {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState('');
  const [route, setRoute] = useState({ page: 'library', id: null });
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.7);

  useEffect(() => {
    if (!now || !playing) return;
    const t = setInterval(() => setProgress(p => p < now.duration ? p + 1 : 0), 1000);
    return () => clearInterval(t);
  }, [now, playing]);

  function play(song) { setNow(song); setProgress(0); setPlaying(true); }

  if (!authed) return <LoginScreen onSignIn={(e) => { setEmail(e); setAuthed(true); }} />;

  let content;
  if (route.page === 'library')   content = <LibraryPage  onPlay={play} search={search} />;
  if (route.page === 'playlists') content = <PlaylistsPage onOpen={(id) => setRoute({ page: 'playlist', id })} />;
  if (route.page === 'playlist')  content = <PlaylistDetail id={route.id} onPlay={play} />;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-950)' }}>
      <Topbar search={search} setSearch={setSearch} user={email || 'demo@aurora.fm'} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar
          active={route.page === 'playlist' ? 'playlists' : route.page}
          onNav={(id) => setRoute({ page: id, id: null })}
          playlists={PLAYLISTS}
          onNewPlaylist={() => {}}
        />
        <main style={{ flex: 1, padding: 32, paddingBottom: 120, overflow: 'auto' }} className="scrollbar">
          {content}
        </main>
      </div>
      <PlayerBar song={now} isPlaying={playing} onToggle={() => setPlaying(p => !p)} progress={progress} duration={now ? now.duration : 0} onSeek={setProgress} volume={volume} onVolume={setVolume} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
