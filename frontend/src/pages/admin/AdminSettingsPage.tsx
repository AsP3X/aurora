// Human: Key/value instance settings — glass DataTable + modal for new keys; inline edit with upsert.
// Agent: loadSettings; handleSave PATCH; handleAdd POST via updateAdminSetting; USES PageHeader DataTable GlassDialog GlassButton.
import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminSettings,
  updateAdminSetting,
  fetchArtworkMigrationStatus,
  startArtworkMigration,
  type ArtworkMigrationStatus,
  fetchHlsMigrationStatus,
  startHlsMigration,
  type HlsMigrationStatus,
  fetchDatabaseMigrationStatus,
  validateDatabaseMigration,
  startDatabaseMigration,
  type DatabaseMigrationStatus,
} from "../../api/client";
import PageHeader from "../../components/admin/PageHeader";
import DataTable from "../../components/admin/DataTable";
import type { DataTableColumn } from "../../components/admin/DataTable";
import MobileDataCard from "../../components/admin/MobileDataCard";
import GlassDialog from "../../components/admin/GlassDialog";
import GlassButton from "../../components/admin/GlassButton";
import AdminGlassCard from "../../components/admin/AdminGlassCard";
import { DEFAULT_SQLITE_MIGRATION_SOURCE } from "../../lib/databaseConnection";

interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

type ArtworkStatusBadgeVariant = "scanning" | "ready" | "complete" | "pending";

// Human: Two-part status badge (dark icon tile + colored label) for cover-art migration state.
// Agent: PROPS scanning|status|pendingCount; LABELS plain-language WebP migration state; RENDERS inline-flex badge.
function ArtworkMigrationStatusBadge({
  scanning,
  status,
  pendingCount = 0,
}: {
  scanning: boolean;
  status: string | undefined;
  pendingCount?: number;
}) {
  const variant: ArtworkStatusBadgeVariant =
    pendingCount > 0
      ? "pending"
      : scanning
        ? "scanning"
        : status === "complete"
          ? "complete"
          : "ready";

  const config: Record<
    ArtworkStatusBadgeVariant,
    { label: string; panel: string; icon: string; ariaLabel: string }
  > = {
    scanning: {
      label: "SCANNING COVERS",
      panel: "bg-surface-600",
      icon: "text-surface-300",
      ariaLabel: "Scanning the library for cover art that still needs WebP conversion",
    },
    pending: {
      label:
        pendingCount === 1 ? "1 NEEDS WEBP" : `${pendingCount} NEED WEBP`,
      panel: "bg-red-700",
      icon: "text-red-400",
      ariaLabel: `${pendingCount} cover${pendingCount === 1 ? "" : "s"} still need conversion to seeker, library, and detail WebP sizes`,
    },
    ready: {
      label: "WEBP READY",
      panel: "bg-emerald-700",
      icon: "text-emerald-400",
      ariaLabel:
        "All cover art already uses optimized WebP sizes for seeker, library, and detail views",
    },
    complete: {
      label: "MIGRATION DONE",
      panel: "bg-emerald-600",
      icon: "text-emerald-300",
      ariaLabel:
        "Cover art migration finished; legacy images were converted to WebP variants",
    },
  };

  const { label, panel, icon, ariaLabel } = config[variant];

  return (
    <div
      className="inline-flex -mt-2 overflow-hidden border border-white/10 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="flex h-7 w-8 shrink-0 items-center justify-center bg-black">
        {variant === "scanning" ? (
          <span
            className={`h-3 w-3 animate-pulse rounded-full bg-current ${icon}`}
            aria-hidden
          />
        ) : variant === "pending" ? (
          <svg
            className={`h-4 w-4 ${icon}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        ) : variant === "complete" ? (
          <svg
            className={`h-4 w-4 ${icon}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className={`h-4 w-4 ${icon}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </div>
      <div className={`flex h-7 min-h-7 items-center px-3 ${panel}`}>
        <span className="whitespace-nowrap text-[10px] font-bold leading-none tracking-wide text-white uppercase">
          {label}
        </span>
      </div>
    </div>
  );
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

  const [hlsMigration, setHlsMigration] = useState<HlsMigrationStatus | null>(null);
  const [hlsMigrationExpanded, setHlsMigrationExpanded] = useState(false);
  const [hlsMigrationStarting, setHlsMigrationStarting] = useState(false);

  const [dbMigration, setDbMigration] = useState<DatabaseMigrationStatus | null>(null);
  const [dbMigrationExpanded, setDbMigrationExpanded] = useState(true);
  const [sqliteSourceUrl, setSqliteSourceUrl] = useState(DEFAULT_SQLITE_MIGRATION_SOURCE);
  const [dbValidateResult, setDbValidateResult] = useState<{
    ready: boolean;
    checks: DatabaseMigrationStatus["checks"];
  } | null>(null);
  const [dbConfirmEmpty, setDbConfirmEmpty] = useState(false);
  const [dbConfirmBackup, setDbConfirmBackup] = useState(false);
  const [dbConfirmPhrase, setDbConfirmPhrase] = useState("");
  const [dbMigrationBusy, setDbMigrationBusy] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    void fetchHlsMigrationStatus()
      .then((status) => {
        if (!cancelled) setHlsMigration(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hlsMigration?.status !== "running") return;
    const interval = setInterval(() => {
      void fetchHlsMigrationStatus()
        .then((status) => setHlsMigration(status))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [hlsMigration?.status]);

  useEffect(() => {
    if (hlsMigration?.status === "running") {
      setHlsMigrationExpanded(true);
    }
  }, [hlsMigration?.status]);

  useEffect(() => {
    let cancelled = false;
    void fetchDatabaseMigrationStatus()
      .then((status) => {
        if (!cancelled) {
          setDbMigration(status);
          const source =
            status.source_sqlite_url?.trim() ||
            status.default_source_sqlite_url?.trim() ||
            DEFAULT_SQLITE_MIGRATION_SOURCE;
          setSqliteSourceUrl(source);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dbMigration?.target_driver !== "postgres") return;
    if (!sqliteSourceUrl.trim()) return;
    if (dbMigration.status === "running" || dbMigration.status === "complete") return;
    if (dbValidateResult != null) return;

    let cancelled = false;
    void validateDatabaseMigration(sqliteSourceUrl.trim())
      .then((res) => {
        if (!cancelled) {
          setDbValidateResult({ ready: res.ready, checks: res.checks });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dbMigration?.target_driver, dbMigration?.status, sqliteSourceUrl, dbValidateResult]);

  useEffect(() => {
    if (dbMigration?.status !== "complete" || !dbMigration.verify_ok) return;
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [dbMigration?.status, dbMigration?.verify_ok]);

  useEffect(() => {
    if (dbMigration?.status !== "running") return;
    const interval = setInterval(() => {
      void fetchDatabaseMigrationStatus()
        .then((status) => setDbMigration(status))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [dbMigration?.status]);

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

  // Human: Red “NEEDS WEBP” badge when legacy covers still await conversion (not while a job is running).
  // Agent: READS pending_count + status; RENDERS ArtworkMigrationStatusBadge variant pending.
  const showArtworkPendingBadge =
    artworkMigration != null &&
    artworkMigration.pending_count > 0 &&
    artworkMigration.status !== "running";

  const migrationPanelNeedsAttention =
    artworkMigration != null &&
    artworkMigration.pending_count > 0 &&
    artworkMigration.status !== "running";

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
  async function handleValidateDatabaseMigration() {
    if (!sqliteSourceUrl.trim()) {
      setError("Enter the path or sqlite: URL of your old SQLite database");
      return;
    }
    setDbMigrationBusy(true);
    setError("");
    try {
      const res = await validateDatabaseMigration(sqliteSourceUrl.trim());
      setDbValidateResult({ ready: res.ready, checks: res.checks });
      const status = await fetchDatabaseMigrationStatus();
      setDbMigration(status);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Database validation failed");
    } finally {
      setDbMigrationBusy(false);
    }
  }

  async function handleStartDatabaseMigration() {
    if (!sqliteSourceUrl.trim()) {
      setError("Enter the SQLite source database first");
      return;
    }
    setDbMigrationBusy(true);
    setError("");
    try {
      const status = await startDatabaseMigration({
        sqlite_database_url: sqliteSourceUrl.trim(),
        confirm_target_empty: dbConfirmEmpty,
        confirm_source_backup: dbConfirmBackup,
        confirmation_phrase: dbConfirmPhrase,
      });
      setDbMigration(status);
      setDbValidateResult(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start database migration");
    } finally {
      setDbMigrationBusy(false);
    }
  }

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

  async function handleStartHlsMigration() {
    setHlsMigrationStarting(true);
    setError("");
    try {
      const status = await startHlsMigration();
      setHlsMigration(status);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start HLS encryption migration");
    } finally {
      setHlsMigrationStarting(false);
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

      {/* Human: Red badge when artworks await migration; green/gray badge when library is current. */}
      {/* Agent: showArtworkPendingBadge → pendingCount; showArtworkStatusChip → scanning|ready|complete. */}
      {showArtworkPendingBadge && artworkMigration && (
        <ArtworkMigrationStatusBadge
          scanning={false}
          status={artworkMigration.status}
          pendingCount={artworkMigration.pending_count}
        />
      )}
      {showArtworkStatusChip && (
        <ArtworkMigrationStatusBadge
          scanning={migrationScanning}
          status={artworkMigration?.status}
        />
      )}

      {/* Human: Expandable migration controls when legacy covers still need WebP processing. */}
      {/* Agent: COLLAPSIBLE AdminGlassCard; TOGGLE artworkMigrationExpanded; CONTAINS start + progress. */}
      {showArtworkMigrationPanel && artworkMigration && (
        <AdminGlassCard
          className={`!p-0 overflow-hidden ${
            migrationPanelNeedsAttention ? "ring-1 ring-red-800/70" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setArtworkMigrationExpanded((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-aurora-500/50"
            aria-expanded={artworkMigrationExpanded}
          >
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Cover art (WebP)</h2>
              <p
                className={`text-xs mt-0.5 truncate ${
                  migrationPanelNeedsAttention ? "text-red-400" : "text-surface-500"
                }`}
              >
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

      {hlsMigration != null &&
        (hlsMigration.pending_count > 0 ||
          hlsMigration.status === "running" ||
          hlsMigration.status === "failed" ||
          hlsMigration.failed > 0) && (
        <AdminGlassCard padding="md" className="space-y-4">
          <button
            type="button"
            onClick={() => setHlsMigrationExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-aurora-500/40 rounded"
          >
            <div>
              <h2 className="text-sm font-semibold text-white">HLS encryption migration</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Transcode songs that lack AES-128 HLS segments or decryptable encryption keys (common after SQLite imports)
              </p>
            </div>
            <span className="text-surface-400 text-xs">{hlsMigrationExpanded ? "Hide" : "Show"}</span>
          </button>

          {hlsMigrationExpanded && (
            <div className="space-y-4 border-t border-white/10 pt-4">
              <p className="text-sm text-surface-300">
                {hlsMigration.status === "running"
                  ? `Encrypting… ${hlsMigration.progress}% (${hlsMigration.processed}/${hlsMigration.total} done, ${hlsMigration.failed} failed)`
                  : hlsMigration.pending_count > 0
                    ? `${hlsMigration.pending_count} song(s) need HLS encryption before playback can decrypt streams.`
                    : "All songs have working encrypted HLS."}
              </p>
              {(hlsMigration.status === "running" || hlsMigration.progress > 0) && (
                <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-aurora-500 rounded-full transition-all duration-200"
                    style={{ width: `${hlsMigration.progress}%` }}
                  />
                </div>
              )}
              {hlsMigration.error && (
                <p className="text-xs text-red-300">{hlsMigration.error}</p>
              )}
              <GlassButton
                type="button"
                disabled={
                  hlsMigrationStarting ||
                  loading ||
                  hlsMigration.status === "running" ||
                  hlsMigration.pending_count === 0
                }
                onClick={() => void handleStartHlsMigration()}
              >
                {hlsMigration.status === "running"
                  ? "Migrating…"
                  : hlsMigrationStarting
                    ? "Starting…"
                    : "Migrate songs to encrypted HLS"}
              </GlassButton>
            </div>
          )}
        </AdminGlassCard>
      )}

      {dbMigration?.target_driver === "postgres" && (
        <AdminGlassCard padding="md" className="space-y-4">
          <button
            type="button"
            onClick={() => setDbMigrationExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-aurora-500/40 rounded"
          >
            <div>
              <h2 className="text-sm font-semibold text-white">SQLite → PostgreSQL migration</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Move an existing SQLite library into this PostgreSQL instance (target must be empty)
              </p>
            </div>
            <span className="text-surface-400 text-xs">{dbMigrationExpanded ? "Hide" : "Show"}</span>
          </button>

          {dbMigrationExpanded && (
            <div className="space-y-4 border-t border-white/10 pt-4">
              {dbMigration.status === "complete" && dbMigration.verify_ok && (
                <p className="text-sm text-emerald-400">
                  Migration completed and verified. Switching to PostgreSQL and reloading…
                </p>
              )}
              {dbMigration.error && (
                <p className="text-sm text-red-400">{dbMigration.error}</p>
              )}
              {dbMigration.status === "running" && (
                <p className="text-sm text-aurora-300">
                  Migrating… {dbMigration.progress}% {dbMigration.phase ? `(${dbMigration.phase})` : ""}
                </p>
              )}

              <label className="block space-y-1">
                <span className="text-xs text-surface-400">SQLite source (path or sqlite: URL)</span>
                <input
                  value={sqliteSourceUrl}
                  onChange={(e) => setSqliteSourceUrl(e.target.value)}
                  placeholder="sqlite:./aurora.db or /data/aurora.db"
                  disabled={dbMigration.status === "running" || dbMigrationBusy}
                  className="w-full px-3 py-2 bg-surface-950/80 border border-white/10 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <GlassButton
                  type="button"
                  disabled={dbMigrationBusy || dbMigration.status === "running"}
                  onClick={() => void handleValidateDatabaseMigration()}
                >
                  {dbMigrationBusy ? "Working…" : "Validate"}
                </GlassButton>
              </div>

              {(dbValidateResult?.checks ?? dbMigration.checks).length > 0 && (
                <ul className="space-y-2 text-xs">
                  {(dbValidateResult?.checks ?? dbMigration.checks).map((c) => (
                    <li
                      key={c.id}
                      className={`flex gap-2 ${c.ok ? "text-surface-300" : "text-red-300"}`}
                    >
                      <span aria-hidden>{c.ok ? "✓" : "✗"}</span>
                      <span>
                        <span className="font-medium text-surface-200">{c.label}:</span> {c.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {dbMigration.source_counts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-mono text-surface-400">
                  {dbMigration.source_counts.map((t) => (
                    <div key={`src-${t.table}`}>
                      {t.table}: {t.count}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 text-sm text-surface-300">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={dbConfirmBackup}
                    onChange={(e) => setDbConfirmBackup(e.target.checked)}
                    disabled={dbMigration.status === "running"}
                    className="mt-1"
                  />
                  <span>I have backed up the SQLite file and object storage blobs</span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={dbConfirmEmpty}
                    onChange={(e) => setDbConfirmEmpty(e.target.checked)}
                    disabled={dbMigration.status === "running"}
                    className="mt-1"
                  />
                  <span>
                    I confirm PostgreSQL has no existing users/songs/playlists/history (empty target)
                  </span>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-surface-400">
                    Type <span className="font-mono text-white">MIGRATE-DATABASE</span> to start
                  </span>
                  <input
                    value={dbConfirmPhrase}
                    onChange={(e) => setDbConfirmPhrase(e.target.value)}
                    disabled={dbMigration.status === "running"}
                    className="w-full px-3 py-2 bg-surface-950/80 border border-white/10 rounded-lg text-sm text-white font-mono"
                  />
                </label>
              </div>

              <GlassButton
                type="button"
                disabled={
                  dbMigrationBusy ||
                  dbMigration.status === "running" ||
                  !(dbValidateResult?.ready ?? false)
                }
                onClick={() => void handleStartDatabaseMigration()}
              >
                {dbMigration.status === "running" ? "Migration running…" : "Start migration"}
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
