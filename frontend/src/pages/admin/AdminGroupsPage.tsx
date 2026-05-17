// Human: Manage permission groups — glass two-pane layout; list cards pick active group; detail cards edit permissions + members.
// Agent: LOAD permissions/groups/users; selectedGroup triggers fetchGroupPermissions+fetchGroupMembers; SAVE setGroupPermissions; USES PageHeader AdminGlassCard.
import { useState, useEffect, useCallback } from "react";
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
} from "../../api/client";
import PermissionManager from "../../components/admin/PermissionManager";
import PageHeader from "../../components/admin/PageHeader";
import AdminGlassCard from "../../components/admin/AdminGlassCard";
import AdminEmptyState from "../../components/admin/AdminEmptyState";

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

export default function AdminGroupsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupPerms, setGroupPerms] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [addMemberId, setAddMemberId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetchPermissions();
      setPermissions(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load permissions";
      setError(message);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load groups";
      setError(message);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load users";
      setError(message);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
    loadGroups();
    loadUsers();
  }, [loadPermissions, loadGroups, loadUsers]);

  useEffect(() => {
    if (!selectedGroup) return;
    setGroupLoading(true);
    Promise.all([fetchGroupPermissions(selectedGroup), fetchGroupMembers(selectedGroup)])
      .then(([perms, members]) => {
        setGroupPerms(perms.map((p: Permission) => p.key));
        setGroupMembers(members);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Failed to load group details";
        setError(message);
      })
      .finally(() => setGroupLoading(false));
  }, [selectedGroup]);

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create group";
      setError(message);
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleSaveGroupPermissions() {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      await setGroupPermissions(selectedGroup, groupPerms);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save group permissions";
      setError(message);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to add member";
      setError(message);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroup) return;
    try {
      await removeGroupMember(selectedGroup, userId);
      setGroupMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to remove member";
      setError(message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Groups" error={error || undefined} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Human: Left column — create form + selectable glass list items (mobile stacks above detail). */}
        {/* Agent: AdminGlassCard WRAPS form+list; BUTTON cards toggle selectedGroup with stronger border when active. */}
        <AdminGlassCard title="Groups" className="lg:sticky lg:top-6 lg:self-start">
          <form onSubmit={handleCreateGroup} className="space-y-3 mb-4">
            <input
              type="text"
              placeholder="New group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-950/60 border border-white/10 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              className="w-full px-3 py-2 bg-surface-950/60 border border-white/10 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
            <button
              type="submit"
              disabled={creatingGroup || !newGroupName.trim()}
              className="w-full py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            >
              {creatingGroup ? "Creating..." : "Create Group"}
            </button>
          </form>

          <div className="space-y-2 max-h-[50vh] lg:max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGroup(g.id)}
                aria-pressed={selectedGroup === g.id}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-aurora-500/50 ${
                  selectedGroup === g.id
                    ? "bg-aurora-500/10 border-aurora-500/20 text-aurora-300"
                    : "border-white/10 bg-surface-950/30 text-surface-300 hover:border-white/25 hover:bg-white/[0.03]"
                }`}
              >
                <div className="font-medium text-white">{g.name}</div>
                {g.description && <div className="text-xs text-surface-500 truncate">{g.description}</div>}
              </button>
            ))}
            {groups.length === 0 && (
              <p className="text-sm text-surface-500 px-1 py-2">No groups yet.</p>
            )}
          </div>
        </AdminGlassCard>

        <div className="lg:col-span-2 space-y-6">
          {selectedGroup ? (
            groupLoading ? (
              <AdminGlassCard>
                <div className="text-surface-400 text-sm py-6 text-center">Loading...</div>
              </AdminGlassCard>
            ) : (
              <>
                <AdminGlassCard>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      {groups.find((g) => g.id === selectedGroup)?.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => void handleSaveGroupPermissions()}
                      disabled={saving}
                      className="px-4 py-1.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                    >
                      {saving ? "Saving..." : "Save Permissions"}
                    </button>
                  </div>
                  <PermissionManager permissions={permissions} assignedKeys={groupPerms} onChange={setGroupPerms} />
                </AdminGlassCard>

                <AdminGlassCard title="Members">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <select
                      value={addMemberId}
                      onChange={(e) => setAddMemberId(e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-2 bg-surface-950/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
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
                      type="button"
                      onClick={() => void handleAddMember()}
                      disabled={!addMemberId}
                      className="px-4 py-2 bg-surface-950/80 hover:bg-surface-900 text-white text-sm font-medium rounded-xl transition-colors border border-white/10 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {groupMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-surface-950/40"
                      >
                        <span className="text-sm text-surface-300">{m.email}</span>
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(m.id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {groupMembers.length === 0 && (
                      <div className="text-sm text-surface-500">No members yet.</div>
                    )}
                  </div>
                </AdminGlassCard>
              </>
            )
          ) : (
            <AdminGlassCard className="py-6">
              <AdminEmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                }
                title="Select a group"
                subtitle="Choose a group from the list to edit permissions and members."
              />
            </AdminGlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
