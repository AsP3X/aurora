import { useState, useEffect, useCallback } from "react";
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
} from "../../api/client";
import PermissionManager from "../../components/admin/PermissionManager";

type Tab = "groups" | "users";

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

export default function AdminDashboard() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("groups");

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupPerms, setGroupPerms] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [userEffectivePerms, setUserEffectivePerms] = useState<string[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [addMemberId, setAddMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    if (!selectedUser) return;
    setUserLoading(true);
    Promise.all([
      fetchUserPermissions(selectedUser),
      fetchUserEffectivePermissions(selectedUser),
    ])
      .then(([perms, effective]) => {
        setUserPerms(perms.map((p: Permission) => p.key));
        setUserEffectivePerms(effective);
      })
      .catch((e: any) => setError(e.message || "Failed to load user details"))
      .finally(() => setUserLoading(false));
  }, [selectedUser]);

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
    if (!selectedUser) return;
    setSaving(true);
    try {
      await setUserPermissions(selectedUser, userPerms);
      const effective = await fetchUserEffectivePermissions(selectedUser);
      setUserEffectivePerms(effective);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-4 border-b border-white/5">
        <button
          onClick={() => { setActiveTab("groups"); setError(""); }}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === "groups"
              ? "text-aurora-400 border-b-2 border-aurora-500"
              : "text-surface-400 hover:text-white"
          }`}
        >
          Groups
        </button>
        <button
          onClick={() => { setActiveTab("users"); setError(""); }}
          className={`pb-2 text-sm font-medium transition-colors ${
            activeTab === "users"
              ? "text-aurora-400 border-b-2 border-aurora-500"
              : "text-surface-400 hover:text-white"
          }`}
        >
          Users
        </button>
      </div>

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

      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-1">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedUser === u.id
                    ? "bg-aurora-500/10 text-aurora-300"
                    : "text-surface-300 hover:bg-white/5"
                }`}
              >
                <div className="font-medium">{u.email}</div>
                <div className="text-xs text-surface-500">{u.role}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedUser ? (
              userLoading ? (
                <div className="text-surface-400 text-sm">Loading...</div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">
                        {users.find((u) => u.id === selectedUser)?.email}
                      </h3>
                      <button
                        onClick={handleSaveUserPermissions}
                        disabled={saving}
                        className="px-4 py-1.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Permissions"}
                      </button>
                    </div>
                    <PermissionManager
                      permissions={permissions}
                      assignedKeys={userPerms}
                      onChange={setUserPerms}
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Effective Permissions</h3>
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
                </>
              )
            ) : (
              <div className="text-surface-400 text-sm">Select a user to manage their permissions.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
