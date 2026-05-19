// Human: Key/value instance settings — glass DataTable + modal for new keys; inline edit with upsert.
// Agent: loadSettings; handleSave PATCH; handleAdd POST via updateAdminSetting; USES PageHeader DataTable GlassDialog GlassButton.
import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminSettings,
  updateAdminSetting,
  fetchArtworkMigrationStatus,
  startArtworkMigration,
  type ArtworkMigrationStatus,
} from "../../api/client";
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

  const [artworkMigration, setArtworkMigration] = useState<ArtworkMigrationStatus | null>(null);
  const [migrationStarting, setMigrationStarting] = useState(false);
  const [migrationScanning, setMigrationScanning] = useState(true);
  const [artworkMigrationExpanded, setArtworkMigrationExpanded] = useState(false);

  const publicRegistration = settings.find((s) => s.key === "allow_public_registration");
  const requireActivation = settings.find((s) => s.key === "require_account_activation");

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

  // Human: Load migration status once when the settings page opens.
  // Agent: EFFECT mount; CALLS fetchArtworkMigrationStatus; SETS artworkMigration.
  useEffect(() => {
    let cancelled = false;
    setMigrationScanning(true);
    void fetchArtworkMigrationStatus()
      .then((status) => {
        if (!cancelled) setArtworkMigration(status);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMigrationScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Human: Poll migration progress every two seconds while the server job is active.
  // Agent: EFFECT [status]; INTERVAL 2s when running; CALLS fetchArtworkMigrationStatus.
  useEffect(() => {
    if (artworkMigration?.status !== "running") return;
    const interval = setInterval(() => {
      void fetchArtworkMigrationStatus()
        .then((status) => {
          setArtworkMigration(status);
          setMigrationScanning(false);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [artworkMigration?.status]);

  // Human: Keep the migration panel open while a job is running so progress stays visible.
  // Agent: EFFECT [status]; SETS artworkMigrationExpanded true when status=running.
  useEffect(() => {
    if (artworkMigration?.status === "running") {
      setArtworkMigrationExpanded(true);
    }
  }, [artworkMigration?.status]);

  // Human: Full panel when work remains, a job is active, or the last run failed; otherwise a one-line status only.
  // Agent: DERIVES from pending_count + status; CONTROLS expandable card vs top chip.
  const showArtworkMigrationPanel =
    artworkMigration != null &&
    (artworkMigration.pending_count > 0 ||
      artworkMigration.status === "running" ||
      artworkMigration.status === "failed");

  const showArtworkStatusChip =
    migrationScanning ||
    (artworkMigration != null &&
      !showArtworkMigrationPanel &&
      artworkMigration.status !== "running");

  // Human: Match backend truthy parsing so toggles work even if a row was edited as `True` or `1`.
  // Agent: PURE; TRIMS; LOWERCASE; TRUE for true/1/yes/on.
  function settingValueIsTrue(value: string | undefined): boolean {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "on";
  }

  async function handleRegistrationToggle(
    key: "allow_public_registration" | "require_account_activation",
    next: boolean,
  ) {
    setSaving(true);
    setError("");
    const value = next ? "true" : "false";
    try {
      await updateAdminSetting(key, value);
      setSettings((prev) => {
        const existing = prev.find((s) => s.key === key);
        if (existing) {
          return prev.map((s) => (s.key === key ? { ...s, value, updated_at: new Date().toISOString() } : s));
        }
        return [...prev, { key, value, updated_at: new Date().toISOString() }];
      });
      if (key === "allow_public_registration" && !next) {
        await updateAdminSetting("require_account_activation", "false");
        setSettings((prev) => {
          const existing = prev.find((s) => s.key === "require_account_activation");
          if (existing) {
            return prev.map((s) =>
              s.key === "require_account_activation"
                ? { ...s, value: "false", updated_at: new Date().toISOString() }
                : s,
            );
          }
          return [
            ...prev,
            { key: "require_account_activation", value: "false", updated_at: new Date().toISOString() },
          ];
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update registration policy";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

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

  // Human: Start background WebP migration for songs that still use a single legacy cover file.
  // Agent: POST startArtworkMigration; SETS artworkMigration from response; DISABLES button while running.
  async function handleStartArtworkMigration() {
    setMigrationStarting(true);
    setError("");
    try {
      const status = await startArtworkMigration();
      setArtworkMigration(status);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to start artwork migration";
      setError(message);
    } finally {
      setMigrationStarting(false);
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

      {/* Human: When every cover already has WebP variants, only a quiet line under the page title — no migration card. */}
      {/* Agent: RENDERS showArtworkStatusChip; TEXT from scanning | up to date | complete. */}
      {showArtworkStatusChip && (
        <p className="text-xs text-surface-500 -mt-2">
          {migrationScanning
            ? "Checking cover art migration status…"
            : artworkMigration?.status === "complete"
              ? "Cover art migration complete — all covers use WebP variants."
              : "Cover art is up to date (WebP variants)."}
        </p>
      )}

      {/* Human: Expandable migration controls when legacy covers still need WebP processing. */}
      {/* Agent: COLLAPSIBLE AdminGlassCard; TOGGLE artworkMigrationExpanded; CONTAINS start + progress. */}
      {showArtworkMigrationPanel && artworkMigration && (
        <AdminGlassCard className="!p-0 overflow-hidden">
          <button
            type="button"
            onClick={() => setArtworkMigrationExpanded((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-aurora-500/50"
            aria-expanded={artworkMigrationExpanded}
          >
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Cover art (WebP)</h2>
              <p className="text-xs text-surface-500 mt-0.5 truncate">
                {artworkMigration.status === "running"
                  ? `Migrating — ${artworkMigration.processed} / ${artworkMigration.total} processed`
                  : artworkMigration.status === "failed"
                    ? "Last migration run reported errors"
                    : `${artworkMigration.pending_count} artwork${
                        artworkMigration.pending_count === 1 ? "" : "s"
                      } need migration`}
              </p>
            </div>
            <svg
              className={`h-5 w-5 shrink-0 text-surface-400 transition-transform ${
                artworkMigrationExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {artworkMigrationExpanded && (
            <div className="space-y-4 border-t border-white/5 px-5 pb-5 pt-4">
              <p className="text-xs text-surface-500">
                Re-process existing cover images into seeker, library, and detail WebP sizes. Songs
                that already have all three variants are skipped.
              </p>
              <div className="space-y-2 text-sm text-surface-300">
                <p>
                  Status:{" "}
                  <span className="text-surface-200 capitalize">{artworkMigration.status}</span>
                  {artworkMigration.status === "running" && artworkMigration.total > 0 && (
                    <span className="text-surface-500">
                      {" "}
                      — {artworkMigration.skipped > 0
                        ? ` (${artworkMigration.skipped} skipped)`
                        : ""}
                      {artworkMigration.failed > 0 ? ` (${artworkMigration.failed} failed)` : ""}
                    </span>
                  )}
                </p>
                {(artworkMigration.status === "running" || artworkMigration.progress > 0) && (
                  <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-aurora-500 rounded-full transition-all duration-200"
                      style={{ width: `${artworkMigration.progress}%` }}
                    />
                  </div>
                )}
                {artworkMigration.error && (
                  <p className="text-xs text-red-300">{artworkMigration.error}</p>
                )}
              </div>
              <GlassButton
                type="button"
                disabled={
                  migrationStarting ||
                  migrationScanning ||
                  loading ||
                  artworkMigration.status === "running" ||
                  artworkMigration.pending_count === 0
                }
                onClick={() => void handleStartArtworkMigration()}
              >
                {artworkMigration.status === "running"
                  ? "Migrating…"
                  : migrationStarting
                    ? "Starting…"
                    : "Migrate artwork to WebP"}
              </GlassButton>
            </div>
          )}
        </AdminGlassCard>
      )}

      {/* Human: First-class toggles for registration policy — avoids typo-prone raw `true`/`false` text edits. */}
      {/* Agent: CALLS handleRegistrationToggle; READS allow_public_registration + require_account_activation rows. */}
      <AdminGlassCard padding="md" className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Registration</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-surface-200">Allow public registration</p>
            <p className="text-xs text-surface-500 mt-0.5">Anyone can create an account from the login page</p>
          </div>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() =>
              void handleRegistrationToggle(
                "allow_public_registration",
                !settingValueIsTrue(publicRegistration?.value),
              )
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 disabled:opacity-50 ${
              settingValueIsTrue(publicRegistration?.value) ? "bg-aurora-600" : "bg-surface-700"
            }`}
            aria-pressed={settingValueIsTrue(publicRegistration?.value)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settingValueIsTrue(publicRegistration?.value) ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <div
          className={`flex items-center justify-between gap-4 ${
            !settingValueIsTrue(publicRegistration?.value) ? "opacity-50" : ""
          }`}
        >
          <div>
            <p className="text-sm font-medium text-surface-200">Require admin approval on register</p>
            <p className="text-xs text-surface-500 mt-0.5">
              New accounts stay inactive until you approve them on the Users page
            </p>
          </div>
          <button
            type="button"
            disabled={saving || loading || !settingValueIsTrue(publicRegistration?.value)}
            onClick={() =>
              void handleRegistrationToggle(
                "require_account_activation",
                !settingValueIsTrue(requireActivation?.value),
              )
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 disabled:cursor-not-allowed disabled:opacity-50 ${
              settingValueIsTrue(requireActivation?.value) ? "bg-aurora-600" : "bg-surface-700"
            }`}
            aria-pressed={settingValueIsTrue(requireActivation?.value)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settingValueIsTrue(requireActivation?.value) ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </AdminGlassCard>


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
