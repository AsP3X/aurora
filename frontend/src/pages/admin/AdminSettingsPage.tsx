// Human: Key/value instance settings — glass DataTable + modal for new keys; inline edit with upsert.
// Agent: loadSettings; handleSave PATCH; handleAdd POST via updateAdminSetting; USES PageHeader DataTable GlassDialog GlassButton.
import { useState, useEffect, useCallback } from "react";
import { fetchAdminSettings, updateAdminSetting } from "../../api/client";
import PageHeader from "../../components/admin/PageHeader";
import DataTable from "../../components/admin/DataTable";
import type { DataTableColumn } from "../../components/admin/DataTable";
import MobileDataCard from "../../components/admin/MobileDataCard";
import GlassDialog from "../../components/admin/GlassDialog";
import GlassButton from "../../components/admin/GlassButton";
import AdminGlassCard from "../../components/admin/AdminGlassCard";

interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load settings";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSave(key: string) {
    setSaving(true);
    try {
      await updateAdminSetting(key, editValue);
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: editValue, updated_at: new Date().toISOString() } : s)),
      );
      setEditingKey(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update setting";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newKey.trim()) return;
    setSaving(true);
    try {
      await updateAdminSetting(newKey.trim(), newValue);
      setSettings((prev) => [
        ...prev,
        { key: newKey.trim(), value: newValue, updated_at: new Date().toISOString() },
      ]);
      setShowAddDialog(false);
      setNewKey("");
      setNewValue("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to add setting";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Setting>[] = [
    {
      key: "key",
      header: "Key",
      render: (s) => <span className="text-white font-mono text-xs break-all">{s.key}</span>,
    },
    {
      key: "value",
      header: "Value",
      render: (s) =>
        editingKey === s.key ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave(s.key);
              if (e.key === "Escape") setEditingKey(null);
            }}
            aria-label={`Edit value for setting ${s.key}`}
            className="w-full px-2 py-1 bg-surface-950/80 border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          />
        ) : (
          <span className="text-surface-300 break-all">{s.value}</span>
        ),
    },
    {
      key: "updated",
      header: "Updated",
      render: (s) => (
        <span className="text-surface-400 text-xs whitespace-nowrap">{new Date(s.updated_at).toLocaleString()}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      className: "text-right",
      render: (s) =>
        editingKey === s.key ? (
          <button
            type="button"
            onClick={() => void handleSave(s.key)}
            disabled={saving}
            className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingKey(s.key);
              setEditValue(s.value);
            }}
            className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Edit
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" error={error || undefined}>
        <GlassButton type="button" onClick={() => setShowAddDialog(true)}>
          Add Setting
        </GlassButton>
      </PageHeader>

      <DataTable<Setting>
        columns={columns}
        data={settings}
        rowKey={(s) => s.key}
        loading={loading}
        renderMobileCard={(s) =>
          editingKey === s.key ? (
            // Human: Avoid nesting `<input>` inside `<p>` from MobileDataCard — dedicated glass card while editing on small screens.
            // Agent: BRANCH editingKey; USES AdminGlassCard stack key+input+Save.
            <AdminGlassCard padding="md" hover className="!p-4">
              <p className="font-mono text-xs text-white break-all">{s.key}</p>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave(s.key);
                  if (e.key === "Escape") setEditingKey(null);
                }}
                aria-label={`Edit value for setting ${s.key}`}
                className="mt-2 w-full px-2 py-2 bg-surface-950/80 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[10px] text-surface-500">{new Date(s.updated_at).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => void handleSave(s.key)}
                  disabled={saving}
                  className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </AdminGlassCard>
          ) : (
            <MobileDataCard
              primary={<span className="font-mono text-xs">{s.key}</span>}
              secondary={<span className="line-clamp-2">{s.value}</span>}
              trailing={
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-surface-500">{new Date(s.updated_at).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKey(s.key);
                      setEditValue(s.value);
                    }}
                    className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                  >
                    Edit
                  </button>
                </div>
              }
            />
          )
        }
      />

      <GlassDialog
        open={showAddDialog}
        onClose={() => {
          setShowAddDialog(false);
          setNewKey("");
          setNewValue("");
        }}
        title="Add Setting"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="admin-setting-new-key" className="block text-xs text-surface-400 mb-1">
              Key
            </label>
            <input
              id="admin-setting-new-key"
              autoFocus
              placeholder="key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
              className="w-full px-3 py-2 bg-surface-950/80 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 font-mono"
            />
          </div>
          <div>
            <label htmlFor="admin-setting-new-value" className="block text-xs text-surface-400 mb-1">
              Value
            </label>
            <input
              id="admin-setting-new-value"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
              className="w-full px-3 py-2 bg-surface-950/80 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <button
            type="button"
            onClick={() => {
              setShowAddDialog(false);
              setNewKey("");
              setNewValue("");
            }}
            className="px-4 py-2 bg-surface-950/80 hover:bg-surface-900 text-white text-sm font-medium rounded-lg transition-colors border border-white/10 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving || !newKey.trim()}
            className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </GlassDialog>
    </div>
  );
}
