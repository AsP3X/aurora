// Human: Operator table for accounts — DataTable + glass dialogs for edit and permission matrix; inline role/enable save from edit dialog.
// Agent: LOAD users+permissions; fetchUserPermissions when editingPermissionsFor; CALLS updateUserRole/updateUserEnabled/setUserPermissions/deleteUser; USES DataTable/MobileDataCard/GlassDialog.
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
  fetchAdminSettings,
} from "../../api/client";
import AdminGlassCard from "../../components/admin/AdminGlassCard";
import PermissionManager from "../../components/admin/PermissionManager";
import ConfirmModal from "../../components/admin/ConfirmModal";
import PageHeader from "../../components/admin/PageHeader";
import DataTable from "../../components/admin/DataTable";
import type { DataTableColumn } from "../../components/admin/DataTable";
import MobileDataCard from "../../components/admin/MobileDataCard";
import GlassDialog from "../../components/admin/GlassDialog";

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
  const [activationRequired, setActivationRequired] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load users";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetchPermissions();
      setPermissions(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load permissions";
      setError(message);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadPermissions();
    fetchAdminSettings()
      .then((settings) => {
        const row = settings.find((s) => s.key === "require_account_activation");
        setActivationRequired(row?.value === "true");
      })
      .catch(() => setActivationRequired(false));
  }, [loadUsers, loadPermissions]);

  // Human: One-click approve for disabled accounts when operators are clearing the activation queue.
  // Agent: CALLS updateUserEnabled(userId, true); OPTIMISTIC users map; SETS approvingId during request.
  async function handleApprove(userId: string) {
    setApprovingId(userId);
    setError("");
    try {
      await updateUserEnabled(userId, true);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, enabled: true } : u)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to approve user";
      setError(message);
    } finally {
      setApprovingId(null);
    }
  }

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
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Failed to load user permissions";
        setError(message);
      })
      .finally(() => setUserLoading(false));
  }, [editingPermissionsFor]);

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update role";
      setError(message);
    }
  }

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await deleteUser(confirmModal.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete user";
      setError(message);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save permissions";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEditClose() {
    if (!editingUser) return;
    const user = users.find((u) => u.id === editingUser);
    if (user) {
      if (editRole !== user.role) {
        await handleRoleChange(editingUser, editRole);
      }
      if (editEnabled !== user.enabled) {
        try {
          await updateUserEnabled(editingUser, editEnabled);
          setUsers((prev) =>
            prev.map((u) => (u.id === editingUser ? { ...u, enabled: editEnabled } : u)),
          );
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Failed to update enabled status";
          setError(message);
        }
      }
    }
    setEditingUser(null);
  }

  function openPermissionsFromEdit() {
    if (!editingUser) return;
    const uid = editingUser;
    setEditingUser(null);
    setEditingPermissionsFor(uid);
  }

  const columns: DataTableColumn<User>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {u.email[0]?.toUpperCase()}
          </div>
          <span className="font-medium text-white truncate">{u.email}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => <RolePill role={u.role} />,
    },
    {
      key: "enabled",
      header: activationRequired ? "Status" : "Enabled",
      render: (u) => <EnabledPill enabled={u.enabled} activationRequired={activationRequired} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      className: "text-right",
      render: (u) => (
        <UserRowActions
          showApprove={!u.enabled}
          approving={approvingId === u.id}
          onApprove={() => void handleApprove(u.id)}
          onEdit={() => {
            setEditingUser(u.id);
            setEditRole(u.role);
            setEditEnabled(u.enabled);
          }}
          onDelete={() => setConfirmModal({ id: u.id, name: u.email })}
        />
      ),
    },
  ];

  const permissionsTitleEmail =
    editingPermissionsFor && users.find((u) => u.id === editingPermissionsFor)?.email;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle={
          activationRequired
            ? "New registrations stay inactive until you approve them below."
            : undefined
        }
        error={error || undefined}
      />

      {activationRequired && (
        <AdminGlassCard padding="md" className="border-amber-500/20 bg-amber-500/5">
          <p className="text-sm text-amber-200/90">
            Account activation is required for this instance. Users who register appear as inactive until you
            enable them (Approve or Edit → Enabled).
          </p>
        </AdminGlassCard>
      )}

      <DataTable<User>
        columns={columns}
        data={users}
        rowKey={(u) => u.id}
        loading={loading}
        renderMobileCard={(u) => (
          <MobileDataCard
            leading={
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {u.email[0]?.toUpperCase()}
              </div>
            }
            primary={u.email}
            secondary={`${u.role} · ${statusLabel(u.enabled, activationRequired)}`}
            trailing={
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex flex-wrap justify-end gap-1">
                  <RolePill role={u.role} />
                  <EnabledPill enabled={u.enabled} activationRequired={activationRequired} />
                </div>
                <UserRowActions
                  showApprove={!u.enabled}
                  approving={approvingId === u.id}
                  onApprove={() => void handleApprove(u.id)}
                  onEdit={() => {
                    setEditingUser(u.id);
                    setEditRole(u.role);
                    setEditEnabled(u.enabled);
                  }}
                  onDelete={() => setConfirmModal({ id: u.id, name: u.email })}
                />
              </div>
            }
          />
        )}
      />

      <GlassDialog open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit User">
        <div className="space-y-4">
          <div>
            {/* Human: Email is read-only — identity changes belong to a future account flow. */}
            {/* Agent: READS users.find by editingUser; DISPLAY text only. */}
            <label className="block text-xs text-surface-400 mb-1">Email</label>
            <p className="text-sm text-white">
              {users.find((u) => u.id === editingUser)?.email}
            </p>
          </div>
          <div>
            <label htmlFor="admin-edit-user-role" className="block text-xs text-surface-400 mb-1">
              Role
            </label>
            <select
              id="admin-edit-user-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            >
              <option value="listener">listener</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span id="admin-edit-user-enabled-label" className="text-xs text-surface-400">
              {activationRequired ? "Active (approved)" : "Enabled"}
            </span>
            <button
              type="button"
              onClick={() => setEditEnabled((v) => !v)}
              aria-pressed={editEnabled}
              aria-labelledby="admin-edit-user-enabled-label"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 ${
                editEnabled ? "bg-aurora-600" : "bg-surface-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  editEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <EnabledPill enabled={editEnabled} activationRequired={activationRequired} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end mt-6">
          <button
            type="button"
            onClick={() => setEditingUser(null)}
            className="px-4 py-2 bg-surface-950/80 hover:bg-surface-900 text-white text-sm font-medium rounded-lg transition-colors border border-white/10 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={openPermissionsFromEdit}
            className="px-4 py-2 bg-surface-950/80 hover:bg-surface-900 text-aurora-300 text-sm font-medium rounded-lg transition-colors border border-aurora-500/30 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Edit Permissions
          </button>
          <button
            type="button"
            onClick={() => void handleSaveEditClose()}
            className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Save
          </button>
        </div>
      </GlassDialog>

      <GlassDialog
        open={!!editingPermissionsFor}
        onClose={() => setEditingPermissionsFor(null)}
        title={permissionsTitleEmail ? `Edit Permissions — ${permissionsTitleEmail}` : "Edit Permissions"}
        size="lg"
        className="max-h-[80vh] overflow-y-auto"
      >
        {userLoading ? (
          <div className="text-surface-400 text-sm">Loading...</div>
        ) : (
          <>
            <PermissionManager permissions={permissions} assignedKeys={userPerms} onChange={setUserPerms} />
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-white mb-2">Effective Permissions</h4>
              <div className="flex flex-wrap gap-2">
                {userEffectivePerms.length > 0 ? (
                  userEffectivePerms.map((key) => (
                    <span
                      key={key}
                      className="px-2 py-1 bg-surface-950/80 text-surface-300 text-xs rounded-lg border border-white/10"
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
                type="button"
                onClick={() => setEditingPermissionsFor(null)}
                className="px-4 py-2 bg-surface-950/80 hover:bg-surface-900 text-white text-sm font-medium rounded-lg transition-colors border border-white/10 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveUserPermissions()}
                disabled={saving}
                className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
              >
                {saving ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </>
        )}
      </GlassDialog>

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

// Human: Role badge — admin vs listener tint so ops can scan the grid quickly.
// Agent: PROPS role string; VISUAL border+pill; ICON none (text + color not alone — role word shown).
function RolePill({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${
        admin
          ? "bg-aurora-500/10 text-aurora-300 border-aurora-500/20"
          : "bg-surface-800 text-surface-300 border-white/10"
      }`}
    >
      <svg className="w-3 h-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {role}
    </span>
  );
}

// Human: Short label for list rows — “Pending” when activation mode is on and the account is inactive.
// Agent: PURE statusLabel(enabled, activationRequired); RETURNS Active|Pending approval|Disabled string.
function statusLabel(enabled: boolean, activationRequired: boolean): string {
  if (enabled) return "Active";
  return activationRequired ? "Pending approval" : "Disabled";
}

// Human: Enabled state pill — icon reinforces green/amber/red beyond color alone.
// Agent: PROPS enabled + activationRequired; LABEL Active|Pending|Disabled; VISUAL emerald/amber/red borders.
function EnabledPill({
  enabled,
  activationRequired = false,
}: {
  enabled: boolean;
  activationRequired?: boolean;
}) {
  const pending = !enabled && activationRequired;
  const label = enabled ? "Active" : pending ? "Pending" : "Disabled";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${
        enabled
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
          : pending
            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
            : "bg-red-500/10 text-red-300 border-red-500/20"
      }`}
    >
      {enabled ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : pending ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {label}
    </span>
  );
}

// Human: Compact row actions — quick Approve for inactive users plus edit/delete.
// Agent: PROPS showApprove approving onApprove onEdit onDelete; CALLS onApprove when Approve clicked.
function UserRowActions({
  showApprove,
  approving,
  onApprove,
  onEdit,
  onDelete,
}: {
  showApprove: boolean;
  approving: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {showApprove && (
        <button
          type="button"
          onClick={onApprove}
          disabled={approving}
          className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          {approving ? "…" : "Approve"}
        </button>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
      >
        Delete
      </button>
    </div>
  );
}
