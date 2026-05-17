// Human: Operator table for accounts — inline role toggles, enable/disable, per-user permission matrix modal, delete confirm.
// Agent: LOAD users+permissions; fetchUserPermissions when editing; CALLS updateUserRole/updateUserEnabled/setUserPermissions/deleteUser.
import { useState, useEffect, useCallback } from "react";
import {
  fetchUsers,
  fetchPermissions,
  fetchUserPermissions,
  fetchUserEffectivePermissions,
  setUserPermissions,
  updateUserRole,
  updateUserEnabled,
  deleteUser,
} from "../../api/client";
import PermissionManager from "../../components/admin/PermissionManager";
import ConfirmModal from "../../components/admin/ConfirmModal";

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface User {
  id: string;
  email: string;
  role: string;
  enabled: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);

  const [editingPermissionsFor, setEditingPermissionsFor] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [userEffectivePerms, setUserEffectivePerms] = useState<string[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetchPermissions();
      setPermissions(data);
    } catch (e: any) {
      setError(e.message || "Failed to load permissions");
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadPermissions();
  }, [loadUsers, loadPermissions]);

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
      .catch((e: any) => setError(e.message || "Failed to load user permissions"))
      .finally(() => setUserLoading(false));
  }, [editingPermissionsFor]);

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
      await deleteUser(confirmModal.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete user");
    } finally {
      setDeleting(false);
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
      setError(e.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[500px]">
          <thead className="bg-surface-950/50 text-surface-400 text-xs uppercase border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Enabled</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                  <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center text-xs font-bold text-white">
                        {u.email[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${
                      u.role === "admin"
                        ? "bg-aurora-500/10 text-aurora-300 border-aurora-500/20"
                        : "bg-surface-800 text-surface-300 border-white/10"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${
                      u.enabled
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                        : "bg-red-500/10 text-red-300 border-red-500/20"
                    }`}>
                      {u.enabled ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingUser(u.id); setEditRole(u.role); setEditEnabled(u.enabled); }}
                        className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmModal({ id: u.id, name: u.email })}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Edit User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-surface-400 mb-1">Email</label>
                <p className="text-sm text-white">{users.find((u) => u.id === editingUser)?.email}</p>
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
              <div className="flex items-center gap-3">
                <label className="block text-xs text-surface-400">Enabled</label>
                <button
                  type="button"
                  onClick={() => setEditEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    editEnabled ? "bg-aurora-600" : "bg-surface-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      editEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
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
                  if (user) {
                    if (editRole !== user.role) {
                      await handleRoleChange(editingUser, editRole);
                    }
                    if (editEnabled !== user.enabled) {
                      try {
                        await updateUserEnabled(editingUser, editEnabled);
                        setUsers((prev) =>
                          prev.map((u) =>
                            u.id === editingUser ? { ...u, enabled: editEnabled } : u
                          )
                        );
                      } catch (e: any) {
                        setError(e.message || "Failed to update enabled status");
                      }
                    }
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
                        <span key={key} className="px-2 py-1 bg-surface-800 text-surface-300 text-xs rounded-lg border border-white/5">
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

      {confirmModal && (
        <ConfirmModal
          title="Delete User"
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
