// Human: Primary dashboard — stats cards, debounced search, recent/topmost grids, all inside `DashboardLayout`.
// Agent: PARALLEL initial fetch stats/recent/history/top; SEARCH debounce 250ms fetchSongs; KEYBOARD "/" focuses search.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchSongs,
  fetchRecentSongs,
  fetchHistory,
  fetchStats,
  fetchTopPlays,
} from "../api/client";
import SongCard from "../components/SongCard";
import DashboardLayout from "../components/DashboardLayout";
import ArtworkImage from "../components/ArtworkImage";
import StatCard from "../components/StatCard";
import ApiErrorBanner from "../components/ApiErrorBanner";
import type { Song } from "../types";

// Human: Short human-readable duration for aggregate stats (hours appear when large).
// Agent: PURE formatter for stats cards.
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default function Library() {
  const searchRef = useRef<HTMLInputElement>(null);

  /* Data states */
  const [stats, setStats] = useState<{ total_songs: number; total_artists: number; total_albums: number; total_duration_seconds: number } | null>(null);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; song_id: string; title: string; artist: string; album: string | null; artwork_key: string | null; duration_seconds: number; started_at: string }> | null>(null);
  const [topPlays, setTopPlays] = useState<Array<{ song_id: string; title: string; artist: string; album: string | null; artwork_key: string | null; duration_seconds: number; play_count: number; last_played_at: string | null }> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Song[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Human: Vim-style focus — "/" jumps to search unless user is already typing in an input.
  // Agent: keydown listener; PREVENTDEFAULT when target not INPUT/TEXTAREA.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Human: On mount pull all dashboard slices — failures degrade to empty/null segments rather than hard error page.
  // Agent: Promise.all fetchStats, fetchRecentSongs, fetchHistory, fetchTopPlays; SETS loading false in then.
  const loadDashboard = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchStats(),
      fetchRecentSongs(12),
      fetchHistory(),
      fetchTopPlays(),
    ])
      .then(([statsData, recent, historyData, topPlaysData]) => {
        setStats(statsData);
        setRecentSongs(recent);
        setHistory(historyData);
        setTopPlays(topPlaysData);
      })
      .catch(() => {
        setLoadError("Could not load your library. Check your connection and try again.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Human: Debounce typing so we do not hit `/songs` on every keystroke while still feeling instant.
  // Agent: EFFECT [searchQuery]; CLEARS results when empty; TIMER 250ms then fetchSongs q.
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetchSongs({ q: searchQuery.trim(), limit: 50 })
        .then((results) => {
          setSearchResults(results);
          setSearchLoading(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearchLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const displaySongs = isSearching ? (searchResults ?? []) : recentSongs;

  /* Search bar for topbar */
  const searchBar = (
    <div className="relative">
      <label htmlFor="library-search" className="sr-only">
        Search songs, artists, and albums
      </label>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        id="library-search"
        ref={searchRef}
        type="search"
        placeholder="Search songs, artists, albums..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full h-10 bg-surface-900 border border-white/5 rounded-full pl-10 pr-4 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500/50 focus:border-aurora-500/30 transition-all"
      />
      {isSearching && (
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 rounded-full p-0.5"
          aria-label="Clear search"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-surface-400 text-sm">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout topbarExtra={searchBar}>
      {loadError && <ApiErrorBanner message={loadError} onRetry={loadDashboard} />}
      {/* Stats row */}
      {stats && !isSearching && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Songs"
            value={formatNumber(stats.total_songs)}
            icon={
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            }
            colorClass="bg-aurora-600/20 text-aurora-400"
          />
          <StatCard
            label="Artists"
            value={formatNumber(stats.total_artists)}
            icon={
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            colorClass="bg-rose-500/20 text-rose-400"
          />
          <StatCard
            label="Albums"
            value={formatNumber(stats.total_albums)}
            icon={
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            colorClass="bg-amber-500/20 text-amber-400"
          />
          <StatCard
            label="Total Duration"
            value={formatDuration(stats.total_duration_seconds)}
            icon={
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            colorClass="bg-emerald-500/20 text-emerald-400"
          />
        </div>
      )}

      {/* Search results or Recently Added */}
      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {isSearching ? `Search results for "${searchQuery}"` : "Recently Added"}
            </h2>
            {isSearching && searchResults !== null && (
              <span className="text-xs text-surface-500">{searchResults.length} found</span>
            )}
          </div>
          {isSearching && searchLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-aurora-500 border-t-transparent" />
            </div>
          ) : displaySongs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-surface-500 text-sm">
                {isSearching ? "No songs match your search." : "No songs in the library yet."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displaySongs.map((song, i) => (
                <SongCard key={song.id} song={song} songs={displaySongs} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* Recently Played */}
        {!isSearching && history && history.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Recently Played</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {history.slice(0, 6).map((entry) => (
                <Link
                  key={entry.id}
                  to={`/player/${entry.song_id}`}
                  className="group block space-y-3 hover:bg-surface-900/40 rounded-xl p-2 transition-all duration-200"
                >
                  <div className="relative aspect-square bg-surface-900 border border-white/5 rounded-xl overflow-hidden shadow-sm">
                    <ArtworkImage
                      songId={entry.song_id}
                      title={entry.title}
                      artist={entry.artist || undefined}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="w-10 h-10 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="px-1">
                    <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
                      {entry.title}
                    </p>
                    <p className="text-xs text-surface-400 truncate">{entry.artist}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Most Played */}
        {!isSearching && topPlays && topPlays.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Most Played</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {topPlays.slice(0, 6).map((entry) => (
                <Link
                  key={entry.song_id}
                  to={`/player/${entry.song_id}`}
                  className="group block space-y-3 hover:bg-surface-900/40 rounded-xl p-2 transition-all duration-200"
                >
                  <div className="relative aspect-square bg-surface-900 border border-white/5 rounded-xl overflow-hidden shadow-sm">
                    <ArtworkImage
                      songId={entry.song_id}
                      title={entry.title}
                      artist={entry.artist || undefined}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="w-10 h-10 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="px-1">
                    <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
                      {entry.title}
                    </p>
                    <p className="text-xs text-surface-400 truncate">{entry.artist}</p>
                    <p className="text-[11px] text-surface-500 truncate">{entry.play_count} play{entry.play_count > 1 ? "s" : ""}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
