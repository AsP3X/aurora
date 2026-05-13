import type { Song, SongDraft, Playlist } from "../types";

function getApiBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return `${window.location.protocol}//${window.location.hostname}:3000/api/v1`;
}

const API_BASE = getApiBase();

function getToken(): string | null {
  return localStorage.getItem("aurora_token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const token = getToken();
  const method = options.method || "GET";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const start = performance.now();
  const reqBody = options.body
    ? typeof options.body === "string"
      ? options.body.slice(0, 200)
      : "[Blob/FormData]"
    : undefined;

  console.group(`[API] ${method} ${path}`);
  console.log("Request:", { method, url, headers: Object.keys(headers), body: reqBody });

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const elapsed = (performance.now() - start).toFixed(1);
    console.error("Network error:", err);
    console.groupEnd();
    throw new Error(`Network error after ${elapsed}ms: ${err instanceof Error ? err.message : String(err)}`);
  }

  const elapsed = (performance.now() - start).toFixed(1);
  const ok = res.ok ? "OK" : "ERR";

  if (res.status === 401) {
    console.warn(`[API] ${method} ${path} → ${res.status} (${elapsed}ms) — Unauthorized, redirecting to login`);
    console.groupEnd();
    localStorage.removeItem("aurora_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[API] ${method} ${path} → ${res.status} (${elapsed}ms) ${ok}`, body);
    console.groupEnd();
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  console.log(`[API] ${method} ${path} → ${res.status} (${elapsed}ms) ${ok}`);
  console.groupEnd();

  if (res.status === 204) return null;
  return res.json();
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
  const token = getToken();
  const url = `${API_BASE}/songs/${id}/playlist`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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
  });
}

export async function fetchHistory() {
  return apiFetch("/history") as Promise<Array<{
    id: string;
    user_id: string;
    song_id: string;
    started_at: string;
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

    const token = getToken();
    const url = `${API_BASE}/admin/songs/${id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (res.status === 401) {
      localStorage.removeItem("aurora_token");
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<Song>;
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

  const token = getToken();
  const url = `${API_BASE}/admin/songs/stage`;

  console.log("[stageSong] sending file:", {
    name: file.name,
    type: file.type,
    size: file.size,
    formDataEntries: Array.from(form.keys()),
  });

  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  console.log("[stageSong] response:", {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
  });

  if (res.status === 401) {
    localStorage.removeItem("aurora_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[stageSong] error body:", body);
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<import("../types").SongDraft>;
}

export async function commitSong(draft: import("../types").SongDraft, artworkBlob?: Blob) {
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(draft)], { type: "application/json" })
  );
  if (artworkBlob) {
    form.append("artwork", artworkBlob, "artwork.jpg");
  }

  const token = getToken();
  const url = `${API_BASE}/admin/songs/commit`;

  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401) {
    localStorage.removeItem("aurora_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<import("../types").Song>;
}

export function stagedArtworkUrl(stagingId: string) {
  return `${API_BASE}/admin/songs/stage/${stagingId}/artwork`;
}

export function stageSongWithProgress(
  file: File,
  onProgress: (percent: number) => void
): Promise<SongDraft> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("audio", file);

    const token = getToken();
    const url = `${API_BASE}/admin/songs/stage`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        localStorage.removeItem("aurora_token");
        window.location.href = "/login";
        reject(new Error("Unauthorized"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        let errBody: { error?: string } = {};
        try {
          errBody = JSON.parse(xhr.responseText);
        } catch {
          /* ignore parse error */
        }
        reject(new Error(errBody.error || `HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

export function commitSongWithProgress(
  draft: SongDraft,
  artworkBlob: Blob | undefined,
  onProgress: (percent: number) => void
): Promise<Song> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(draft)], { type: "application/json" })
    );
    if (artworkBlob) {
      form.append("artwork", artworkBlob, "artwork.jpg");
    }

    const token = getToken();
    const url = `${API_BASE}/admin/songs/commit`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        localStorage.removeItem("aurora_token");
        window.location.href = "/login";
        reject(new Error("Unauthorized"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        let errBody: { error?: string } = {};
        try {
          errBody = JSON.parse(xhr.responseText);
        } catch {
          /* ignore parse error */
        }
        reject(new Error(errBody.error || `HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}
