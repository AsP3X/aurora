import type { Song, SongDraft, Playlist } from "../types";

// Human: Resolve API root from Vite env or same host on port 3000 for local dev.
// Agent: READS VITE_API_URL; RETURNS /api/v1 base URL string.
function getApiBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return `${window.location.protocol}//${window.location.hostname}:3000/api/v1`;
}

const API_BASE = getApiBase();

// Human: Verbose API tracing only in Vite dev — production builds stay quiet in the console.
// Agent: READS import.meta.env.DEV; GATES console.group/log/warn/error in apiFetchResponse.
const API_DEBUG = import.meta.env.DEV;

function getToken(): string | null {
  return localStorage.getItem("aurora_token");
}

type ApiErrorPayload = { error?: string; message?: string; status?: number };

/** Thrown by {@link apiFetch}, {@link apiFetchForm}, and upload helpers on failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly rawBody: string;

  constructor(params: { message: string; status: number; path: string; rawBody: string }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.path = params.path;
    this.rawBody = params.rawBody;
  }
}

// Human: Pull a user-visible message from Aurora's `{ error, status }` JSON or plain-text bodies.
// Agent: PARSES raw body; PREFERS error then message; FALLBACK HTTP status label.
function parseApiErrorMessage(raw: string, status: number): string {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ApiErrorPayload;
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
    } catch {
      const trimmed = raw.trim();
      if (trimmed) return trimmed.slice(0, 400);
    }
  }
  return `HTTP ${status}`;
}

// Human: Build a typed ApiError after the server responded with a non-success status.
// Agent: CALLS parseApiErrorMessage; RETURNS ApiError with path/status/rawBody for UI.
export function apiErrorFromResponse(path: string, status: number, raw: string): ApiError {
  return new ApiError({
    message: parseApiErrorMessage(raw, status),
    status,
    path,
    rawBody: raw,
  });
}

// Human: Session expired — clear token and send the user to login (same behavior as apiFetch).
// Agent: WRITES localStorage remove; NAVIGATES /login; THROWS ApiError 401 (never returns).
function clearAuthAndRedirect(path: string): never {
  localStorage.removeItem("aurora_token");
  window.location.href = "/login";
  throw new ApiError({
    message: "Unauthorized",
    status: 401,
    path,
    rawBody: "",
  });
}

// Human: Shared fetch wrapper: auth header, 401 handling, and consistent error parsing.
// Agent: EMITS fetch to API_BASE+path; ON 401 clearAuthAndRedirect; ON !ok apiErrorFromResponse.
async function apiFetchResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const token = getToken();
  const method = options.method || "GET";

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  const hasExplicitContentType = Boolean(headers["Content-Type"] ?? headers["content-type"]);
  if (
    !hasExplicitContentType &&
    options.body != null &&
    typeof options.body === "string" &&
    (method === "POST" || method === "PUT" || method === "PATCH")
  ) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const start = performance.now();
  const reqBody = options.body
    ? typeof options.body === "string"
      ? options.body.slice(0, 200)
      : "[Blob/FormData]"
    : undefined;

  if (API_DEBUG) {
    console.group(`[API] ${method} ${path}`);
    console.log("Request:", { method, url, headers: Object.keys(headers), body: reqBody });
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const elapsed = (performance.now() - start).toFixed(1);
    if (API_DEBUG) {
      console.error("Network error:", err);
      console.groupEnd();
    }
    throw new ApiError({
      message: `Network error after ${elapsed}ms: ${err instanceof Error ? err.message : String(err)}`,
      status: 0,
      path,
      rawBody: "",
    });
  }

  const elapsed = (performance.now() - start).toFixed(1);
  const ok = res.ok ? "OK" : "ERR";

  if (res.status === 401) {
    if (API_DEBUG) {
      console.warn(`[API] ${method} ${path} → ${res.status} (${elapsed}ms) — Unauthorized, redirecting to login`);
      console.groupEnd();
    }
    clearAuthAndRedirect(path);
  }

  if (!res.ok) {
    const raw = await res.text();
    if (API_DEBUG) {
      console.error(`[API] ${method} ${path} → ${res.status} (${elapsed}ms) ${ok}`, raw ? { raw: raw.slice(0, 500) } : {});
      console.groupEnd();
    }
    throw apiErrorFromResponse(path, res.status, raw);
  }

  if (API_DEBUG) {
    console.log(`[API] ${method} ${path} → ${res.status} (${elapsed}ms) ${ok}`);
    console.groupEnd();
  }

  return res;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await apiFetchResponse(path, options);
  if (res.status === 204) return null;
  return res.json();
}

// Human: GET (or other) that returns raw text — used for HLS m3u8 playlist bodies.
// Agent: CALLS apiFetchResponse; READS res.text(); THROWS ApiError on failure.
async function apiFetchText(path: string, options: RequestInit = {}): Promise<string> {
  const res = await apiFetchResponse(path, options);
  return res.text();
}

// Human: Multipart upload endpoints (stage/commit/artwork PUT) share JSON success and error envelopes.
// Agent: POST/PUT FormData via apiFetchResponse; PARSES JSON body; RETURNS typed T.
async function apiFetchForm<T>(path: string, form: FormData, method: "POST" | "PUT" = "POST"): Promise<T> {
  const res = await apiFetchResponse(path, { method, body: form });
  return res.json() as Promise<T>;
}

// Human: XMLHttpRequest upload with progress events; same error shape as fetch helpers.
// Agent: XHR upload to API_BASE+path; ON 401 clearAuthAndRedirect; ON error apiErrorFromResponse.
function xhrUploadForm<T>(
  path: string,
  form: FormData,
  method: "POST" | "PUT",
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const url = `${API_BASE}${path}`;
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      const raw = xhr.responseText ?? "";
      if (xhr.status === 401) {
        clearAuthAndRedirect(path);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(
            new ApiError({
              message: "Invalid JSON response",
              status: xhr.status,
              path,
              rawBody: raw,
            }),
          );
        }
        return;
      }
      reject(apiErrorFromResponse(path, xhr.status, raw));
    };

    xhr.onerror = () =>
      reject(
        new ApiError({
          message: "Network error",
          status: 0,
          path,
          rawBody: "",
        }),
      );

    xhr.send(form);
  });
}

export async function login(email: string, password: string) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }) as Promise<{ token: string; user: { id: string; email: string; role: string; permissions: string[] } }>;
}

export async function register(email: string, password: string) {
  return apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }) as Promise<{ token: string; user: { id: string; email: string; role: string; permissions: string[] } }>;
}

export async function me() {
  return apiFetch("/me") as Promise<{ id: string; email: string; role: string; permissions: string[] }>;
}

export async function fetchSongs(params?: { artist?: string; album?: string; q?: string; limit?: number; offset?: number; order_by?: string }) {
  const qs = new URLSearchParams();
  if (params?.artist) qs.set("artist", params.artist);
  if (params?.album) qs.set("album", params.album);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));
  if (params?.order_by) qs.set("order_by", params.order_by);
  return apiFetch(`/songs?${qs.toString()}`) as Promise<Song[]>;
}

export async function fetchRecentSongs(limit = 12) {
  return fetchSongs({ order_by: "created_at", limit });
}

export async function fetchSong(id: string) {
  return apiFetch(`/songs/${id}`) as Promise<Song>;
}

export function streamUrl(id: string) {
  return `${API_BASE}/songs/${id}/stream`;
}

export function artworkUrl(id: string) {
  return `${API_BASE}/songs/${id}/artwork`;
}

export async function fetchStreamUrl(id: string) {
  const res = await apiFetch(`/songs/${id}/stream-url`) as { url: string };
  return res.url;
}

export async function fetchPlaylistUrl(id: string): Promise<string> {
  return apiFetchText(`/songs/${id}/playlist`);
}

export async function fetchArtworkUrl(id: string): Promise<string | null> {
  const res = await apiFetch(`/songs/${id}/artwork-url`) as { url: string | null };
  return res.url;
}

export async function fetchPlaylists() {
  return apiFetch("/playlists") as Promise<Playlist[]>;
}

export async function createPlaylist(name: string, description?: string) {
  return apiFetch("/playlists", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  }) as Promise<Playlist>;
}

export async function fetchPlaylist(id: string) {
  return apiFetch(`/playlists/${id}`) as Promise<{ playlist: Playlist; songs: Song[] }>;
}

export async function updatePlaylist(
  id: string,
  body: { name?: string; description?: string; is_public?: boolean }
) {
  return apiFetch(`/playlists/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<Playlist>;
}

export async function deletePlaylist(id: string) {
  return apiFetch(`/playlists/${id}`, { method: "DELETE" });
}

export async function addSongToPlaylist(playlistId: string, songId: string) {
  return apiFetch(`/playlists/${playlistId}/songs`, {
    method: "POST",
    body: JSON.stringify({ song_id: songId }),
  });
}

export async function removeSongFromPlaylist(playlistId: string, songId: string) {
  return apiFetch(`/playlists/${playlistId}/songs/${songId}`, { method: "DELETE" });
}

export async function reorderPlaylistSongs(playlistId: string, songIds: string[]) {
  return apiFetch(`/playlists/${playlistId}/songs/reorder`, {
    method: "PUT",
    body: JSON.stringify({ song_ids: songIds }),
  });
}

export async function logHistory(songId: string, duration?: number, completed = false) {
  return apiFetch("/history", {
    method: "POST",
    body: JSON.stringify({ song_id: songId, duration_listened_seconds: duration, completed }),
  }) as Promise<{ id: string }>;
}

export async function updateHistory(id: string, duration: number, completed = false) {
  return apiFetch(`/history/${id}`, {
    method: "PUT",
    body: JSON.stringify({ duration_listened_seconds: Math.round(duration), completed }),
  });
}

export async function fetchHistory(limit = 20) {
  return apiFetch(`/history?limit=${limit}`) as Promise<Array<{
    id: string;
    user_id: string;
    song_id: string;
    started_at: string;
    ended_at: string | null;
    duration_listened_seconds: number | null;
    completed: number;
    title: string;
    artist: string;
    album: string | null;
    artwork_key: string | null;
    duration_seconds: number;
  }>>;
}

export async function fetchPlayCount(id: string) {
  return apiFetch(`/songs/${id}/play-count`) as Promise<{ song_id: string; play_count: number }>;
}

export async function fetchTopPlays() {
  return apiFetch("/me/top-plays") as Promise<Array<{
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    artwork_key: string | null;
    duration_seconds: number;
    play_count: number;
    last_played_at: string | null;
  }>>;
}

export async function fetchStats() {
  return apiFetch("/stats") as Promise<{
    total_songs: number;
    total_artists: number;
    total_albums: number;
    total_duration_seconds: number;
  }>;
}

export async function fetchListeningTime(period: "today" | "week" | "month" | "all") {
  return apiFetch(`/me/listening-time?period=${period}`) as Promise<{ total_seconds: number }>;
}

export async function fetchListeningHabits() {
  return apiFetch("/me/listening-habits") as Promise<{
    peak_hours: Array<{ hour: number; total_seconds: number }>;
    day_of_week: Array<{ day: number; total_seconds: number }>;
  }>;
}

export async function fetchTopArtists(period: "today" | "week" | "month" | "all" = "all") {
  return apiFetch(`/me/top-artists?period=${period}`) as Promise<Array<{
    artist: string;
    total_seconds: number;
    play_count: number;
  }>>;
}

export async function fetchTopAlbums(period: "today" | "week" | "month" | "all" = "all") {
  return apiFetch(`/me/top-albums?period=${period}`) as Promise<Array<{
    album: string;
    album_artist: string | null;
    total_seconds: number;
    play_count: number;
  }>>;
}

export type UserSongListeningRow = {
  song_id: string;
  title: string;
  artist: string;
  album: string | null;
  artwork_key: string | null;
  duration_seconds: number;
  play_count: number;
  total_listened_seconds: number;
};

export async function fetchListeningBySong(
  period: "today" | "week" | "month" | "all" = "all",
  limit = 500
) {
  return apiFetch(`/me/listening-by-song?period=${period}&limit=${limit}`) as Promise<UserSongListeningRow[]>;
}

export type ListeningSessionRow = {
  id: string;
  user_id: string;
  song_id: string;
  started_at: string;
  ended_at: string | null;
  duration_listened_seconds: number | null;
  completed: boolean;
  title: string;
  artist: string;
  album: string | null;
  song_duration_seconds: number;
};

function listeningSessionsQuery(
  period: "today" | "week" | "month" | "all",
  limit: number,
  songId?: string
) {
  const q = new URLSearchParams({ period, limit: String(limit) });
  if (songId) q.set("song_id", songId);
  return `?${q.toString()}`;
}

export async function fetchListeningSessions(
  period: "today" | "week" | "month" | "all" = "all",
  limit = 500,
  songId?: string
) {
  return apiFetch(`/me/listening-sessions${listeningSessionsQuery(period, limit, songId)}`) as Promise<
    ListeningSessionRow[]
  >;
}

export async function fetchAdminListeningStats() {
  return apiFetch("/admin/listening-stats") as Promise<{
    total_plays: number;
    active_users: number;
    total_listening_seconds: number;
    avg_duration_seconds: number;
  }>;
}

export async function setupStatus() {
  return apiFetch("/setup/status", { cache: "no-store" }) as Promise<{ setup_complete: boolean }>;
}

export async function fetchPublicRegistrationSetting() {
  return apiFetch("/settings/registration", { cache: "no-store" }) as Promise<{ allow_public_registration: boolean }>;
}

export async function setup(body: {
  email: string;
  password: string;
  instance_name: string;
  allow_public_registration: boolean;
  music_dir: string;
}) {
  return apiFetch("/setup", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{ token: string; user: { id: string; email: string; role: string; permissions: string[] } }>;
}

// Admin APIs

export async function fetchPermissions() {
  return apiFetch("/admin/permissions") as Promise<Array<{ id: string; key: string; name: string; description: string | null; category: string }>>;
}

export async function fetchGroups() {
  return apiFetch("/admin/groups") as Promise<Array<{ id: string; name: string; description: string | null }>>;
}

export async function createGroup(name: string, description?: string) {
  return apiFetch("/admin/groups", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  }) as Promise<{ id: string; name: string; description: string | null }>;
}

export async function fetchGroupPermissions(groupId: string) {
  return apiFetch(`/admin/groups/${groupId}/permissions`) as Promise<Array<{ id: string; key: string; name: string; description: string | null; category: string }>>;
}

export async function setGroupPermissions(groupId: string, permissionKeys: string[]) {
  return apiFetch(`/admin/groups/${groupId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_keys: permissionKeys }),
  });
}

export async function fetchGroupMembers(groupId: string) {
  return apiFetch(`/admin/groups/${groupId}/members`) as Promise<Array<{ id: string; email: string; role: string }>>;
}

export async function addGroupMember(groupId: string, userId: string) {
  return apiFetch(`/admin/groups/${groupId}/members`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeGroupMember(groupId: string, userId: string) {
  return apiFetch(`/admin/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

export async function fetchUsers() {
  return apiFetch("/admin/users") as Promise<Array<{ id: string; email: string; role: string; enabled: boolean }>>;
}

export async function fetchAdminUserListeningBySong(
  userId: string,
  period: "today" | "week" | "month" | "all" = "all",
  limit = 500
) {
  return fetchAdminListeningBySong([userId], period, limit);
}

/** Aggregate listening by song (POST JSON; GET query still supported by the server). */
export async function fetchAdminListeningBySong(
  userIds: string[],
  period: "today" | "week" | "month" | "all" = "all",
  limit = 500,
  init: Omit<RequestInit, "method" | "body"> = {}
) {
  const ids = [...new Set(userIds.map((id) => String(id).trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) {
    return [] as UserSongListeningRow[];
  }
  return apiFetch(`/admin/listening-by-song`, {
    method: "POST",
    body: JSON.stringify({ user_ids: ids, period, limit }),
    ...init,
  }) as Promise<UserSongListeningRow[]>;
}

export async function fetchAdminUserListeningSessions(
  userId: string,
  period: "today" | "week" | "month" | "all" = "all",
  limit = 500,
  songId?: string
) {
  return fetchAdminListeningSessions([userId], period, limit, songId);
}

export async function fetchAdminListeningSessions(
  userIds: string[],
  period: "today" | "week" | "month" | "all" = "all",
  limit = 500,
  songId?: string,
  init: Omit<RequestInit, "method" | "body"> = {}
) {
  const ids = [...new Set(userIds.map((id) => String(id).trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) {
    return [] as ListeningSessionRow[];
  }
  const body: Record<string, unknown> = { user_ids: ids, period, limit };
  if (songId) body.song_id = songId;
  return apiFetch(`/admin/listening-sessions`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
  }) as Promise<ListeningSessionRow[]>;
}

export async function updateUserEnabled(userId: string, enabled: boolean) {
  return apiFetch(`/admin/users/${userId}/enabled`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function fetchUserPermissions(userId: string) {
  return apiFetch(`/admin/users/${userId}/permissions`) as Promise<Array<{ id: string; key: string; name: string; description: string | null; category: string }>>;
}

export async function setUserPermissions(userId: string, permissionKeys: string[]) {
  return apiFetch(`/admin/users/${userId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_keys: permissionKeys }),
  });
}

export async function fetchUserEffectivePermissions(userId: string) {
  return apiFetch(`/admin/users/${userId}/effective-permissions`) as Promise<string[]>;
}

export async function updateUserRole(userId: string, role: string) {
  return apiFetch(`/admin/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function deleteUser(userId: string) {
  return apiFetch(`/admin/users/${userId}`, { method: "DELETE" });
}

export async function fetchAdminSongs(params?: { q?: string; limit?: number; offset?: number; order_by?: string }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));
  if (params?.order_by) qs.set("order_by", params.order_by);
  return apiFetch(`/admin/songs?${qs.toString()}`) as Promise<Song[]>;
}

export async function deleteAdminSong(id: string) {
  return apiFetch(`/admin/songs/${id}`, { method: "DELETE" });
}

export async function updateAdminSong(
  id: string,
  body: Partial<Pick<Song, "title" | "artist" | "album" | "album_artist" | "track_number" | "year" | "genres" | "studio">>,
  artworkBlob?: Blob,
  removeArtwork?: boolean,
) {
  if (artworkBlob || removeArtwork) {
    const form = new FormData();
    const metadata = {
      ...body,
      remove_artwork: removeArtwork ?? false,
    };
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    if (artworkBlob) {
      form.append("artwork", artworkBlob, "artwork.jpg");
    }

    return apiFetchForm<Song>(`/admin/songs/${id}`, form, "PUT");
  }

  return apiFetch(`/admin/songs/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<Song>;
}

export async function toggleAdminSongEnabled(id: string, enabled: boolean) {
  return apiFetch(`/admin/songs/${id}/enabled`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  }) as Promise<Song>;
}

export async function fetchAdminPlaylists() {
  return apiFetch("/admin/playlists") as Promise<Array<{
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    is_public: boolean;
    created_at: string;
    owner_email: string;
    song_count: number;
  }>>;
}

export async function deleteAdminPlaylist(id: string) {
  return apiFetch(`/admin/playlists/${id}`, { method: "DELETE" });
}

export async function fetchAdminStats() {
  return apiFetch("/admin/stats") as Promise<{
    total_users: number;
    total_songs: number;
    total_playlists: number;
    total_storage_bytes: number;
  }>;
}

export async function fetchAdminSettings() {
  return apiFetch("/admin/settings") as Promise<Array<{ key: string; value: string; updated_at: string }>>;
}

export async function updateAdminSetting(key: string, value: string) {
  return apiFetch(`/admin/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export async function fetchValues(
  field: "artist" | "album" | "album_artist" | "genre" | "studio",
  q?: string,
  limit?: number
) {
  const qs = new URLSearchParams();
  qs.set("field", field);
  if (q) qs.set("q", q);
  if (limit !== undefined) qs.set("limit", String(limit));
  return apiFetch(`/songs/values?${qs.toString()}`) as Promise<string[]>;
}

export async function fetchAlbumSongCount(album: string): Promise<number> {
  const qs = new URLSearchParams({ album });
  const result = await apiFetch(`/songs/album-song-count?${qs.toString()}`) as { count: number };
  return result.count;
}

export async function stageSong(file: File) {
  const form = new FormData();
  form.append("audio", file);
  return apiFetchForm<import("../types").SongDraft>("/admin/songs/stage", form, "POST");
}

export async function commitSong(draft: import("../types").SongDraft, artworkBlob?: Blob) {
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(draft)], { type: "application/json" }),
  );
  if (artworkBlob) {
    form.append("artwork", artworkBlob, "artwork.jpg");
  }
  return apiFetchForm<Song>("/admin/songs/commit", form, "POST");
}

export function stagedArtworkUrl(stagingId: string) {
  return `${API_BASE}/admin/songs/stage/${stagingId}/artwork`;
}

export function stageSongWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<SongDraft> {
  const form = new FormData();
  form.append("audio", file);
  return xhrUploadForm<SongDraft>("/admin/songs/stage", form, "POST", onProgress);
}

export function commitSongWithProgress(
  draft: SongDraft,
  artworkBlob: Blob | undefined,
  onProgress: (percent: number) => void,
): Promise<Song> {
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(draft)], { type: "application/json" }),
  );
  if (artworkBlob) {
    form.append("artwork", artworkBlob, "artwork.jpg");
  }
  return xhrUploadForm<Song>("/admin/songs/commit", form, "POST", onProgress);
}
