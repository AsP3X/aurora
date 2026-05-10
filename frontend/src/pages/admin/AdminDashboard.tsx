import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  fetchPermissions,
  fetchGroups,
  createGroup,
  fetchGroupPermissions,
  setGroupPermissions,
  fetchGroupMembers,
  addGroupMember,
  removeGroupMember,
  fetchUsers,
  fetchUserPermissions,
  setUserPermissions,
  fetchUserEffectivePermissions,
  updateUserRole,
  deleteUser,
  fetchAdminSongs,
  deleteAdminSong,
  fetchAdminPlaylists,
  deleteAdminPlaylist,
  fetchAdminStats,
  fetchAdminSettings,
  updateAdminSetting,
  updateAdminSong,
  toggleAdminSongEnabled,
} from "../../api/client";
import ContextMenu from "../../components/ui/ContextMenu";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import ArtworkImage from "../../components/ArtworkImage";
import PermissionManager from "../../components/admin/PermissionManager";
import UploadSongDialog from "../../components/admin/UploadSongDialog";
import MultiGenreField from "../../components/admin/MultiGenreField";
import type { Song } from "../../types";

type Tab = "overview" | "users" | "groups" | "library" | "playlists" | "settings";

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
}

interface User {
  id: string;
  email: string;
  role: string;
}

interface AdminPlaylist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  owner_email: string;
  song_count: number;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function StatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="bg-surface-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4 hover:border-white/10 transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-xs text-surface-400 font-medium uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-surface-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupPerms, setGroupPerms] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [userEffectivePerms, setUserEffectivePerms] = useState<string[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editingPermissionsFor, setEditingPermissionsFor] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [addMemberId, setAddMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* Overview state */
  const [stats, setStats] = useState<{ total_users: number; total_songs: number; total_playlists: number; total_storage_bytes: number } | null>(null);

  /* Library state */
  const [songs, setSongs] = useState<Song[]>([]);
  const [songQuery, setSongQuery] = useState("");
  const [songOffset, setSongOffset] = useState(0);
  const [songLoading, setSongLoading] = useState(false);
  const SONG_LIMIT = 20;

  /* Playlists state */
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);

  /* Settings state */
  const [settings, setSettings] = useState<{ key: string; value: string; updated_at: string }[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [editingSetting, setEditingSetting] = useState<string | null>(null);
  const [settingEditValue, setSettingEditValue] = useState("");

  /* Confirm delete modal */
  const [confirmModal, setConfirmModal] = useState<{
    type: "user" | "song" | "playlist";
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);

  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    artist: string;
    album: string;
    album_artist: string;
    track_number: string;
    year: string;
    genres: string[];
    studio: string;
  }>({
    title: "",
    artist: "",
    album: "",
    album_artist: "",
    track_number: "",
    year: "",
    genres: [],
    studio: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const existingGenres = useMemo(() => {
    const genres = new Set<string>();
    songs.forEach((s) => s.genres.forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }, [songs]);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetchPermissions();
      setPermissions(data);
    } catch (e: any) {
      setError(e.message || "Failed to load permissions");
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch (e: any) {
      setError(e.message || "Failed to load groups");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    }
  }, []);

  const loadSongs = useCallback(async (q?: string, offset = 0) => {
    setSongLoading(true);
    try {
      const data = await fetchAdminSongs({ q, limit: SONG_LIMIT, offset, order_by: "title" });
      setSongs(data);
    } catch (e: any) {
      setError(e.message || "Failed to load songs");
    } finally {
      setSongLoading(false);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    setPlaylistLoading(true);
    try {
      const data = await fetchAdminPlaylists();
      setPlaylists(data);
    } catch (e: any) {
      setError(e.message || "Failed to load playlists");
    } finally {
      setPlaylistLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
    } catch (e: any) {
      setError(e.message || "Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
    loadGroups();
    loadUsers();
    loadStats();
    loadPlaylists();
    loadSettings();
  }, [loadPermissions, loadGroups, loadUsers, loadStats, loadPlaylists, loadSettings]);

  useEffect(() => {
    if (!selectedGroup) return;
    setGroupLoading(true);
    Promise.all([
      fetchGroupPermissions(selectedGroup),
      fetchGroupMembers(selectedGroup),
    ])
      .then(([perms, members]) => {
        setGroupPerms(perms.map((p: Permission) => p.key));
        setGroupMembers(members);
      })
      .catch((e: any) => setError(e.message || "Failed to load group details"))
      .finally(() => setGroupLoading(false));
  }, [selectedGroup]);

  useEffect(() => {
    if (!editingPermissionsFor) return;
    setUserLoading(true);
    Promise.all([
      fetchUserPermissions(editingPermissionsFor),
      fetchUserEffectivePermissions(editingPermissionsFor),
    ])
      .then(([perms, effective]) => {
        setUserPerms(perms.map((p: Permission) => p.key));
        setUserEffectivePerms(effective);
      })
      .catch((e: any) => setError(e.message || "Failed to load user details"))
      .finally(() => setUserLoading(false));
  }, [editingPermissionsFor]);

  useEffect(() => {
    if (activeTab === "library") {
      loadSongs(songQuery || undefined, songOffset);
    }
  }, [activeTab, songQuery, songOffset, loadSongs]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const group = await createGroup(newGroupName.trim(), newGroupDesc.trim() || undefined);
      setGroups((prev) => [...prev, group]);
      setNewGroupName("");
      setNewGroupDesc("");
      setSelectedGroup(group.id);
    } catch (e: any) {
      setError(e.message || "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleSaveGroupPermissions() {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      await setGroupPermissions(selectedGroup, groupPerms);
    } catch (e: any) {
      setError(e.message || "Failed to save group permissions");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveUserPermissions() {
    if (!editingPermissionsFor) return;
    setSaving(true);
    try {
      await setUserPermissions(editingPermissionsFor, userPerms);
      const effective = await fetchUserEffectivePermissions(editingPermissionsFor);
      setUserEffectivePerms(effective);
      setEditingPermissionsFor(null);
    } catch (e: any) {
      setError(e.message || "Failed to save user permissions");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!selectedGroup || !addMemberId) return;
    try {
      await addGroupMember(selectedGroup, addMemberId);
      const members = await fetchGroupMembers(selectedGroup);
      setGroupMembers(members);
      setAddMemberId("");
    } catch (e: any) {
      setError(e.message || "Failed to add member");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroup) return;
    try {
      await removeGroupMember(selectedGroup, userId);
      setGroupMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (e: any) {
      setError(e.message || "Failed to remove member");
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e: any) {
      setError(e.message || "Failed to update role");
    }
  }

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      if (confirmModal.type === "user") {
        await deleteUser(confirmModal.id);
        setUsers((prev) => prev.filter((u) => u.id !== confirmModal.id));
        if (editingUser === confirmModal.id) setEditingUser(null);
        if (editingPermissionsFor === confirmModal.id) setEditingPermissionsFor(null);
      } else if (confirmModal.type === "song") {
        await deleteAdminSong(confirmModal.id);
        setSongs((prev) => prev.filter((s) => s.id !== confirmModal.id));
      } else if (confirmModal.type === "playlist") {
        await deleteAdminPlaylist(confirmModal.id);
        setPlaylists((prev) => prev.filter((p) => p.id !== confirmModal.id));
      }
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function openEditDialog(song: Song) {
    setEditingSong(song);
    setEditForm({
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      album_artist: song.album_artist || "",
      track_number: song.track_number?.toString() || "",
      year: song.year?.toString() || "",
      genres: song.genres,
      studio: song.studio || "",
    });
  }

  async function handleSaveEdit() {
    if (!editingSong) return;
    setSavingEdit(true);
    try {
      const updated = await updateAdminSong(editingSong.id, {
        title: editForm.title,
        artist: editForm.artist,
        album: editForm.album || undefined,
        album_artist: editForm.album_artist || undefined,
        track_number: editForm.track_number ? parseInt(editForm.track_number, 10) : undefined,
        year: editForm.year ? parseInt(editForm.year, 10) : undefined,
        genres: editForm.genres,
        studio: editForm.studio || undefined,
      });
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSong(null);
    } catch (e: any) {
      setError(e.message || "Failed to update song");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleEnabled(song: Song) {
    try {
      const updated = await toggleAdminSongEnabled(song.id, !song.enabled);
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: any) {
      setError(e.message || "Failed to toggle enabled state");
    }
  }

  function handleContextMenu(e: React.MouseEvent, song: Song) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }

  function buildMenuItems(song: Song): ContextMenuItem[] {
    return [
      {
        label: "Edit",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        onClick: () => openEditDialog(song),
      },
      {
        label: song.enabled ? "Disable" : "Enable",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {song.enabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </>
            )}
          </svg>
        ),
        onClick: () => handleToggleEnabled(song),
      },
      {
        label: "Delete",
        danger: true,
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        onClick: () => setConfirmModal({ type: "song", id: song.id, name: song.title }),
      },
    ];
  }

  async function handleSaveSetting(key: string) {
    try {
      await updateAdminSetting(key, settingEditValue);
      setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value: settingEditValue } : s)));
      setEditingSetting(null);
    } catch (e: any) {
      setError(e.message || "Failed to update setting");
    }
  }

  if (!can("admin.access")) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-surface-400">You do not have permission to access the admin dashboard.</p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: "Users" },
    { key: "groups", label: "Groups" },
    { key: "library", label: "Library" },
    { key: "playlists", label: "Playlists" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-4 border-b border-white/5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setError(""); }}
            className={`pb-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === t.key
                ? "text-aurora-400 border-b-2 border-aurora-500"
                : "text-surface-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Users"
              value={stats ? formatNumber(stats.total_users) : "—"}
              icon={
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              }
              colorClass="bg-aurora-600/20 text-aurora-400"
            />
            <StatCard
              label="Songs"
              value={stats ? formatNumber(stats.total_songs) : "—"}
              icon={
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              }
              colorClass="bg-emerald-500/20 text-emerald-400"
            />
            <StatCard
              label="Playlists"
              value={stats ? formatNumber(stats.total_playlists) : "—"}
              icon={
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
              colorClass="bg-amber-500/20 text-amber-400"
            />
            <StatCard
              label="Storage Used"
              value={stats ? formatBytes(stats.total_storage_bytes) : "—"}
              icon={
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              }
              colorClass="bg-rose-500/20 text-rose-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setActiveTab("users")}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors border border-white/5"
                >
                  Manage Users
                </button>
                <button
                  onClick={() => setActiveTab("library")}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors border border-white/5"
                >
                  Browse Library
                </button>
                <button
                  onClick={() => setActiveTab("playlists")}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors border border-white/5"
                >
                  View Playlists
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors border border-white/5"
                >
                  Edit Settings
                </button>
              </div>
            </div>

            <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">System Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-surface-400">
                  <span>Total registered users</span>
                  <span className="text-white font-medium">{stats ? formatNumber(stats.total_users) : "—"}</span>
                </div>
                <div className="flex justify-between text-surface-400">
                  <span>Tracks in library</span>
                  <span className="text-white font-medium">{stats ? formatNumber(stats.total_songs) : "—"}</span>
                </div>
                <div className="flex justify-between text-surface-400">
                  <span>User playlists</span>
                  <span className="text-white font-medium">{stats ? formatNumber(stats.total_playlists) : "—"}</span>
                </div>
                <div className="flex justify-between text-surface-400">
                  <span>Library storage</span>
                  <span className="text-white font-medium">{stats ? formatBytes(stats.total_storage_bytes) : "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Users Tab ─── */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead className="bg-surface-800 text-surface-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 bg-surface-800 border border-white/10 rounded text-xs text-surface-300 capitalize">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(u.id);
                            setEditRole(u.role);
                          }}
                          className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            setConfirmModal({ type: "user", id: u.id, name: u.email })
                          }
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                          title="Delete user"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit User Dialog */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Edit User
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Email</label>
                    <p className="text-sm text-white">
                      {users.find((u) => u.id === editingUser)?.email}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                    >
                      <option value="listener">listener</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setUserLoading(true);
                      setEditingPermissionsFor(editingUser);
                    }}
                    className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-aurora-300 text-sm font-medium rounded-lg transition-colors border border-aurora-500/20"
                  >
                    Edit Permissions
                  </button>
                  <button
                    onClick={async () => {
                      const user = users.find((u) => u.id === editingUser);
                      if (user && editRole !== user.role) {
                        await handleRoleChange(editingUser, editRole);
                      }
                      setEditingUser(null);
                    }}
                    className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Permissions Dialog */}
          {editingPermissionsFor && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    Edit Permissions — {users.find((u) => u.id === editingPermissionsFor)?.email}
                  </h3>
                  <button
                    onClick={() => setEditingPermissionsFor(null)}
                    className="text-surface-400 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {userLoading ? (
                  <div className="text-surface-400 text-sm">Loading...</div>
                ) : (
                  <>
                    <PermissionManager
                      permissions={permissions}
                      assignedKeys={userPerms}
                      onChange={setUserPerms}
                    />
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold text-white mb-2">Effective Permissions</h4>
                      <div className="flex flex-wrap gap-2">
                        {userEffectivePerms.length > 0 ? (
                          userEffectivePerms.map((key) => (
                            <span
                              key={key}
                              className="px-2 py-1 bg-surface-800 text-surface-300 text-xs rounded-lg border border-white/5"
                            >
                              {key}
                            </span>
                          ))
                        ) : (
                          <div className="text-sm text-surface-500">No effective permissions.</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 justify-end mt-6">
                      <button
                        onClick={() => setEditingPermissionsFor(null)}
                        className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveUserPermissions}
                        disabled={saving}
                        className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Permissions"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Groups Tab ─── */}
      {activeTab === "groups" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <input
                type="text"
                placeholder="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                className="w-full px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
              />
              <button
                type="submit"
                disabled={creatingGroup || !newGroupName.trim()}
                className="w-full py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {creatingGroup ? "Creating..." : "Create Group"}
              </button>
            </form>

            <div className="space-y-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroup(g.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedGroup === g.id
                      ? "bg-aurora-500/10 text-aurora-300"
                      : "text-surface-300 hover:bg-white/5"
                  }`}
                >
                  <div className="font-medium">{g.name}</div>
                  {g.description && (
                    <div className="text-xs text-surface-500 truncate">{g.description}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedGroup ? (
              groupLoading ? (
                <div className="text-surface-400 text-sm">Loading...</div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">
                        {groups.find((g) => g.id === selectedGroup)?.name}
                      </h3>
                      <button
                        onClick={handleSaveGroupPermissions}
                        disabled={saving}
                        className="px-4 py-1.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Permissions"}
                      </button>
                    </div>
                    <PermissionManager
                      permissions={permissions}
                      assignedKeys={groupPerms}
                      onChange={setGroupPerms}
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Members</h3>
                    <div className="flex gap-2 mb-3">
                      <select
                        value={addMemberId}
                        onChange={(e) => setAddMemberId(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                      >
                        <option value="">Select user to add...</option>
                        {users
                          .filter((u) => !groupMembers.find((m) => m.id === u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.email}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleAddMember}
                        disabled={!addMemberId}
                        className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-1">
                      {groupMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-3 py-2 bg-surface-900/50 rounded-lg"
                        >
                          <span className="text-sm text-surface-300">{m.email}</span>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {groupMembers.length === 0 && (
                        <div className="text-sm text-surface-500">No members yet.</div>
                      )}
                    </div>
                  </div>
                </>
              )
            ) : (
              <div className="text-surface-400 text-sm">Select a group to manage its permissions and members.</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Library Tab ─── */}
      {activeTab === "library" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search songs..."
              value={songQuery}
              onChange={(e) => { setSongQuery(e.target.value); setSongOffset(0); }}
              className="flex-1 max-w-md px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
            />
            <button
              onClick={() => setShowUploadDialog(true)}
              className="rounded-md bg-aurora-600 px-3 py-2 text-sm font-medium text-white hover:bg-aurora-500"
            >
              + Upload Song
            </button>
            {songLoading && <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />}
          </div>

          <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 font-medium">Artwork</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Artist</th>
                  <th className="px-4 py-3 font-medium">Album</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Format</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {songs.map((song) => (
                  <tr
                    key={song.id}
                    onContextMenu={(e) => handleContextMenu(e, song)}
                    className={`hover:bg-white/[0.02] transition-colors ${!song.enabled ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <ArtworkImage
                        songId={song.id}
                        title={song.title}
                        artist={song.artist}
                        className="w-10 h-10 rounded-lg object-cover bg-surface-950"
                      />
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        {song.title}
                        {!song.enabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-white/5">
                            Disabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-surface-300">{song.artist}</td>
                    <td className="px-4 py-3 text-surface-400">{song.album || "—"}</td>
                    <td className="px-4 py-3 text-surface-400">{formatDuration(song.duration_seconds)}</td>
                    <td className="px-4 py-3 text-surface-400 uppercase">{song.file_format}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setContextMenu({
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 4,
                            song,
                          });
                        }}
                        className="text-surface-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                        title="More actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {songs.length === 0 && !songLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-surface-500">
                      No songs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setSongOffset((o) => Math.max(0, o - SONG_LIMIT))}
              disabled={songOffset === 0}
              className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-surface-400">
              Showing {songs.length > 0 ? songOffset + 1 : 0}–{songOffset + songs.length}
            </span>
            <button
              onClick={() => setSongOffset((o) => o + SONG_LIMIT)}
              disabled={songs.length < SONG_LIMIT}
              className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>

          {contextMenu && (
            <ContextMenu
              items={buildMenuItems(contextMenu.song)}
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      )}

      {/* ─── Edit Song Dialog ─── */}
      {editingSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Song</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-surface-400 mb-1">Title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Artist</label>
                <input
                  value={editForm.artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album</label>
                <input
                  value={editForm.album}
                  onChange={(e) => setEditForm((f) => ({ ...f, album: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album Artist</label>
                <input
                  value={editForm.album_artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, album_artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Track Number</label>
                <input
                  type="number"
                  value={editForm.track_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, track_number: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Year</label>
                <input
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div className="col-span-2">
                <MultiGenreField
                  label="Genre"
                  values={editForm.genres}
                  onChange={(v) => setEditForm((f) => ({ ...f, genres: v }))}
                  existingValues={existingGenres}
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Studio</label>
                <input
                  value={editForm.studio}
                  onChange={(e) => setEditForm((f) => ({ ...f, studio: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingSong(null)}
                disabled={savingEdit}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.title.trim() || !editForm.artist.trim()}
                className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Playlists Tab ─── */}
      {activeTab === "playlists" && (
        <div className="space-y-4">
          <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Visibility</th>
                  <th className="px-4 py-3 font-medium">Songs</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {playlistLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                      <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : (
                  playlists.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-surface-300">{p.owner_email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${p.is_public ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" : "text-surface-400 border-white/5 bg-surface-800"}`}>
                          {p.is_public ? "Public" : "Private"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-surface-400">{p.song_count}</td>
                      <td className="px-4 py-3 text-surface-400">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setConfirmModal({ type: "playlist", id: p.id, name: p.name })}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                {!playlistLoading && playlists.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                      No playlists found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Settings Tab ─── */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {settingsLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                      <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : (
                  settings.map((s) => (
                    <tr key={s.key} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-mono text-xs">{s.key}</td>
                      <td className="px-4 py-3 text-surface-300">
                        {editingSetting === s.key ? (
                          <input
                            autoFocus
                            value={settingEditValue}
                            onChange={(e) => setSettingEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveSetting(s.key); if (e.key === "Escape") setEditingSetting(null); }}
                            className="w-full px-2 py-1 bg-surface-950 border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                          />
                        ) : (
                          s.value
                        )}
                      </td>
                      <td className="px-4 py-3 text-surface-400 text-xs">{new Date(s.updated_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {editingSetting === s.key ? (
                          <button
                            onClick={() => handleSaveSetting(s.key)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            onClick={() => { setEditingSetting(s.key); setSettingEditValue(s.value); }}
                            className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
                {!settingsLoading && settings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                      No settings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Confirm Modal ─── */}
      {confirmModal && (
        <ConfirmModal
          title={`Delete ${confirmModal.type === "user" ? "User" : confirmModal.type === "song" ? "Song" : "Playlist"}`}
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}

      {showUploadDialog && (
        <UploadSongDialog
          onClose={() => setShowUploadDialog(false)}
          onSuccess={() => {
            if (activeTab === "library") {
              loadSongs(songQuery || undefined, 0);
            }
          }}
        />
      )}
    </div>
  );
}
