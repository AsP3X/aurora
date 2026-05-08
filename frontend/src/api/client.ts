import type { Song, Playlist } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

function getToken(): string | null {
  return localStorage.getItem("aurora_token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  console.log(`[API] ${options.method || "GET"} ${path}`);

  const res = await fetch(url, { ...options, headers });

  console.log(`[API] ${options.method || "GET"} ${path} → ${res.status}`);

  if (res.status === 401) {
    localStorage.removeItem("aurora_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

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

export async function fetchSongs(params?: { artist?: string; album?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.artist) qs.set("artist", params.artist);
  if (params?.album) qs.set("album", params.album);
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));
  return apiFetch(`/songs?${qs.toString()}`) as Promise<Song[]>;
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

export async function addSongToPlaylist(playlistId: string, songId: string) {
  return apiFetch(`/playlists/${playlistId}/songs`, {
    method: "POST",
    body: JSON.stringify({ song_id: songId }),
  });
}

export async function removeSongFromPlaylist(playlistId: string, songId: string) {
  return apiFetch(`/playlists/${playlistId}/songs/${songId}`, { method: "DELETE" });
}

export async function logHistory(songId: string, duration?: number, completed = false) {
  return apiFetch("/history", {
    method: "POST",
    body: JSON.stringify({ song_id: songId, duration_listened_seconds: duration, completed }),
  });
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
  return apiFetch("/admin/users") as Promise<Array<{ id: string; email: string; role: string }>>;
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
