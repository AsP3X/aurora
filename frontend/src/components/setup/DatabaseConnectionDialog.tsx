// Human: Modal to edit Postgres host/credentials or SQLite file path and optionally test connectivity before setup continues.
// Agent: PROPS open onClose fields onChange onApply onTest; CALLS parent onTest with built database_url; USES GlassDialog.
import { useEffect, useState } from "react";
import GlassDialog from "../admin/GlassDialog";
import {
  buildPostgresUrl,
  buildSqliteUrl,
  type DatabaseDriver,
  type PostgresConnectionFields,
} from "../../lib/databaseConnection";

// Human: Props wire the dialog to parent wizard state and the setup database test API.
// Agent: CONTROLLED driver + url; EMITS onApply(databaseUrl); DELEGATES onTest to parent.
export default function DatabaseConnectionDialog({
  open,
  onClose,
  driver,
  databaseUrl,
  postgresFields,
  sqlitePath,
  onApply,
  onTest,
  testing,
  testMessage,
  testError,
}: {
  open: boolean;
  onClose: () => void;
  driver: DatabaseDriver;
  databaseUrl: string;
  postgresFields: PostgresConnectionFields;
  sqlitePath: string;
  onApply: (databaseUrl: string, postgresFields: PostgresConnectionFields, sqlitePath: string) => void;
  onTest: (databaseUrl: string) => void | Promise<void>;
  testing: boolean;
  testMessage: string | null;
  testError: string | null;
}) {
  const [localPostgres, setLocalPostgres] = useState(postgresFields);
  const [localSqlitePath, setLocalSqlitePath] = useState(sqlitePath);

  useEffect(() => {
    if (!open) return;
    setLocalPostgres(postgresFields);
    setLocalSqlitePath(sqlitePath);
  }, [open, postgresFields, sqlitePath]);

  const builtUrl =
    driver === "postgres" ? buildPostgresUrl(localPostgres) : buildSqliteUrl(localSqlitePath);

  const urlChanged = builtUrl !== databaseUrl;

  return (
    <GlassDialog open={open} onClose={onClose} title="Database connection" size="lg" zIndexClass="z-[60]">
      <div className="space-y-4">
        {driver === "postgres" ? (
          <PostgresFields fields={localPostgres} onChange={setLocalPostgres} />
        ) : (
          <SqliteFields path={localSqlitePath} onChange={setLocalSqlitePath} />
        )}

        <div className="rounded-lg bg-surface-950/80 border border-white/10 px-3 py-2">
          <p className="text-xs text-surface-500 mb-1">Connection string</p>
          <p className="text-xs text-surface-300 font-mono break-all">{builtUrl}</p>
        </div>

        {testError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {testError}
          </p>
        )}
        {testMessage && !testError && (
          <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            {testMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 text-sm text-surface-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onTest(builtUrl)}
            disabled={testing}
            className="h-10 px-4 text-sm font-medium rounded-xl border border-white/10 text-surface-200 hover:bg-white/5 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            onClick={() => onApply(builtUrl, localPostgres, localSqlitePath)}
            className="h-10 px-5 text-sm font-medium rounded-xl bg-gradient-to-r from-aurora-600 to-aurora-700 text-white shadow-lg shadow-aurora-500/20"
          >
            {urlChanged ? "Apply connection" : "Done"}
          </button>
        </div>
      </div>
    </GlassDialog>
  );
}

function PostgresFields({
  fields,
  onChange,
}: {
  fields: PostgresConnectionFields;
  onChange: (f: PostgresConnectionFields) => void;
}) {
  const set = (key: keyof PostgresConnectionFields, value: string) =>
    onChange({ ...fields, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Host" value={fields.host} onChange={(v) => set("host", v)} placeholder="postgres" />
      <Field label="Port" value={fields.port} onChange={(v) => set("port", v)} placeholder="5432" />
      <Field label="User" value={fields.user} onChange={(v) => set("user", v)} placeholder="aurora" />
      <Field
        label="Password"
        value={fields.password}
        onChange={(v) => set("password", v)}
        type="password"
        placeholder="aurora"
      />
      <Field
        label="Database name"
        value={fields.database}
        onChange={(v) => set("database", v)}
        placeholder="aurora"
        className="sm:col-span-2"
      />
      <p className="sm:col-span-2 text-xs text-surface-500">
        Defaults match the Postgres service in Aurora&apos;s Docker Compose stack. Use host{" "}
        <span className="font-mono text-surface-400">localhost</span> when the API runs on your machine but Postgres is in Docker.
      </p>
    </div>
  );
}

function SqliteFields({ path, onChange }: { path: string; onChange: (p: string) => void }) {
  return (
    <div>
      <Field label="SQLite database file" value={path} onChange={onChange} placeholder="aurora.db" />
      <p className="text-xs text-surface-500 mt-2">
        Relative paths are resolved from the backend working directory (for local dev, usually the{" "}
        <span className="font-mono text-surface-400">backend/</span> folder).
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-surface-300 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-4 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
      />
    </div>
  );
}
