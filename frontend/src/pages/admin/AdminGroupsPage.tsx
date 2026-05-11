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
      .catch((e: any) => setError(e.message || "Failed to load group details"))
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Groups</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Group list + create */}
        <div className="space-y-4">
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
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                  selectedGroup === g.id
                    ? "bg-aurora-500/10 text-aurora-300 border border-aurora-500/20"
                    : "text-surface-300 hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="font-medium">{g.name}</div>
                {g.description && <div className="text-xs text-surface-500 truncate">{g.description}</div>}
              </button>
            ))}
            {groups.length === 0 && (
              <div className="text-sm text-surface-500 px-3 py-2">No groups yet.</div>
            )}
          </div>
        </div>

        {/* Right: Group detail */}
        <div className="lg:col-span-2 space-y-6">
          {selectedGroup ? (
            groupLoading ? (
              <div className="text-surface-400 text-sm">Loading...</div>
            ) : (
              <>
                <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
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

                <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
                  <h3 className="text-lg font-semibold text-white mb-4">Members</h3>
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
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-surface-950/50 rounded-lg">
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
            <div className="bg-surface-900 border border-white/5 rounded-2xl p-8 text-center text-surface-400 text-sm">
              Select a group to manage its permissions and members.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
