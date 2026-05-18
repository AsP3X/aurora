// Human: First-run wizard (admin user, instance options, database, media path) — completes with JWT via `setup` API.
// Agent: MULTI-STEP state; VALIDATES per step; CALLS setup/testSetupDatabase; setAuth; REPLACE navigate "/".
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setup, setupDatabaseInfo, testSetupDatabase } from "../api/client";
import { useAuth } from "../context/AuthContext";
import NetworkBackground from "../components/NetworkBackground";
import DatabaseConnectionDialog from "../components/setup/DatabaseConnectionDialog";
import {
  buildPostgresUrl,
  buildSqliteUrl,
  DEFAULT_POSTGRES_URL,
  DEFAULT_SQLITE_PATH,
  DOCKER_POSTGRES_DEFAULTS,
  parsePostgresUrl,
  sqlitePathFromUrl,
  type DatabaseDriver,
  type PostgresConnectionFields,
} from "../lib/databaseConnection";

type Step = 1 | 2 | 3;

export default function Setup() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [instanceName, setInstanceName] = useState("Aurora Music");
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(false);
  const [requireAccountActivation, setRequireAccountActivation] = useState(false);
  const [musicDir, setMusicDir] = useState("/music");
  const [databaseDriver, setDatabaseDriver] = useState<DatabaseDriver>("postgres");
  const [databaseUrl, setDatabaseUrl] = useState(DEFAULT_POSTGRES_URL);
  const [postgresFields, setPostgresFields] = useState<PostgresConnectionFields>(DOCKER_POSTGRES_DEFAULTS);
  const [sqlitePath, setSqlitePath] = useState(DEFAULT_SQLITE_PATH);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTestMessage, setDbTestMessage] = useState<string | null>(null);
  const [dbTestError, setDbTestError] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Human: Pre-fill database fields from the running API when possible (Docker Postgres URL, local SQLite, etc.).
  // Agent: CALLS setupDatabaseInfo once; MAPS driver + url into wizard state; IGNORES errors (wizard keeps compose defaults).
  useEffect(() => {
    let cancelled = false;
    setupDatabaseInfo()
      .then((info) => {
        if (cancelled) return;
        const driver = info.driver === "sqlite" ? "sqlite" : "postgres";
        setDatabaseDriver(driver);
        setDatabaseUrl(info.database_url);
        if (driver === "postgres") {
          const parsed = parsePostgresUrl(info.database_url);
          if (parsed) setPostgresFields(parsed);
        } else {
          setSqlitePath(sqlitePathFromUrl(info.database_url));
        }
      })
      .catch(() => {
        /* keep Docker Postgres defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Human: Step 1 validates account fields client-side before advancing the wizard.
  // Agent: RETURNS error string or null; CHECKS email regex + password length + match.
  function validateStep1(): string | null {
    if (!email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  function validateStep2(): string | null {
    if (!instanceName.trim()) return "Instance name is required";
    if (!databaseUrl.trim()) return "Database connection is required";
    return null;
  }

  // Human: Switching driver rebuilds the connection URL from the matching default form values.
  // Agent: MUTATES databaseDriver + databaseUrl; READS postgresFields/sqlitePath builders.
  function selectDatabaseDriver(driver: DatabaseDriver) {
    setDatabaseDriver(driver);
    setDbTestMessage(null);
    setDbTestError(null);
    if (driver === "postgres") {
      const url = buildPostgresUrl(postgresFields);
      setDatabaseUrl(url);
    } else {
      setDatabaseUrl(buildSqliteUrl(sqlitePath));
    }
  }

  // Human: Connection dialog applies edited host/credentials back to the wizard summary line.
  // Agent: WRITES databaseUrl + postgresFields/sqlitePath; CLOSES dialog.
  function applyDatabaseConnection(
    url: string,
    fields: PostgresConnectionFields,
    path: string,
  ) {
    setDatabaseUrl(url);
    setPostgresFields(fields);
    setSqlitePath(path);
    setDbTestMessage(null);
    setDbTestError(null);
    setConnectionDialogOpen(false);
  }

  // Human: Optional connectivity check before setup — surfaces API errors in the dialog.
  // Agent: CALLS testSetupDatabase; SETS dbTestMessage or dbTestError.
  async function handleTestDatabase(url: string) {
    setDbTestMessage(null);
    setDbTestError(null);
    setDbTesting(true);
    try {
      const res = await testSetupDatabase(url);
      setDbTestMessage(`Connected successfully (${res.driver}).`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Connection test failed";
      setDbTestError(message);
    } finally {
      setDbTesting(false);
    }
  }

  function validateStep3(): string | null {
    if (!musicDir.trim()) return "Music library path is required";
    return null;
  }

  // Human: Linear wizard navigation with inline validation errors surfaced in the shared `error` banner.
  // Agent: next() advances step when validators pass; back() decreases step with floor 1.
  const next = () => {
    setError("");
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setStep(2);
    } else if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      setStep(3);
    }
  };

  const back = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 1) as Step);
  };

  // Human: Final step posts full payload — successful setup logs the admin in immediately.
  // Agent: validateStep3; CALLS setup API; setAuth; navigate("/", replace).
  async function handleSubmit() {
    setError("");
    const err = validateStep3();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const res = await setup({
        email: email.trim(),
        password,
        instance_name: instanceName.trim(),
        allow_public_registration: allowPublicRegistration,
        require_account_activation: requireAccountActivation,
        music_dir: musicDir.trim(),
        database_url: databaseUrl.trim(),
      });
      if (res.restart_required) {
        const url = res.configured_database_url ?? databaseUrl.trim();
        setError(
          `Database configured. Set DATABASE_URL to the chosen connection string, restart Aurora, then sign in. Example: ${url}`,
        );
        return;
      }
      if (!res.token) {
        setError("Setup did not return a session token.");
        return;
      }
      setAuth(res.token, res.user);
      navigate("/", { replace: true });
    } catch (e: any) {
      setError(e.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4 aurora-glow relative overflow-hidden">
      <NetworkBackground />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-950/20 via-transparent to-surface-950/60 z-[1] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center shadow-lg shadow-aurora-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight">Aurora Music</span>
        </div>

        {/* Card */}
        <div className="bg-surface-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-8 shadow-2xl">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    s === step
                      ? "bg-aurora-600 text-white shadow-lg shadow-aurora-500/25"
                      : s < step
                        ? "bg-aurora-600/20 text-aurora-400 border border-aurora-500/30"
                        : "bg-surface-800 text-surface-500 border border-white/10"
                  }`}
                >
                  {s < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    s
                  )}
                </div>
                {s < 3 && (
                  <div className={`w-10 h-0.5 rounded-full ${s < step ? "bg-aurora-600/40" : "bg-surface-800"}`} />
                )}
              </div>
            ))}
          </div>

          {/* ── STEP 1: Admin Account ── */}
          {step === 1 && (
            <div className="animate-[fadeIn_0.2s_ease-out]">
              <div className="text-center mb-6">
                <h1 className="text-xl font-semibold mb-1">Create admin account</h1>
                <p className="text-sm text-surface-400">This will be your root administrator account.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@company.com"
                    className="w-full h-10 px-4 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full h-10 px-4 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                  />
                  <p className="text-xs text-surface-500 mt-1.5">Must be at least 8 characters</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full h-10 px-4 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Application Settings ── */}
          {step === 2 && (
            <div className="animate-[fadeIn_0.2s_ease-out]">
              <div className="text-center mb-6">
                <h1 className="text-xl font-semibold mb-1">Application settings</h1>
                <p className="text-sm text-surface-400">Configure how your instance behaves.</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Instance name</label>
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    required
                    placeholder="Aurora Music"
                    className="w-full h-10 px-4 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-surface-300 mb-2">Database</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {(["postgres", "sqlite"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => selectDatabaseDriver(kind)}
                        className={`h-10 rounded-xl border text-sm font-medium transition-all ${
                          databaseDriver === kind
                            ? "border-aurora-500/50 bg-aurora-500/15 text-aurora-200"
                            : "border-white/10 bg-surface-950 text-surface-400 hover:border-white/20"
                        }`}
                      >
                        {kind === "postgres" ? "PostgreSQL" : "SQLite"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 rounded-xl bg-surface-950 border border-white/10 px-3 py-2">
                      <p className="text-xs text-surface-500">Connection</p>
                      <p className="text-xs text-surface-300 font-mono truncate" title={databaseUrl}>
                        {databaseUrl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDbTestMessage(null);
                        setDbTestError(null);
                        setConnectionDialogOpen(true);
                      }}
                      className="h-10 px-4 shrink-0 text-sm font-medium rounded-xl border border-white/10 text-surface-200 hover:bg-white/5 transition-colors"
                    >
                      Configure
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-surface-200">Allow public registration</p>
                    <p className="text-xs text-surface-500 mt-0.5">Anyone can create an account</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAllowPublicRegistration((v) => {
                        const next = !v;
                        if (!next) setRequireAccountActivation(false);
                        return next;
                      })
                    }
                    className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${allowPublicRegistration ? "bg-aurora-600" : "bg-surface-700"}`}
                    aria-pressed={allowPublicRegistration}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${allowPublicRegistration ? "right-1" : "left-1"}`} />
                  </button>
                </div>

                {/* Human: When on, new sign-ups stay inactive until an admin approves them on the Users page. */}
                {/* Agent: STATE requireAccountActivation; POST setup require_account_activation; DISABLED unless allowPublicRegistration. */}
                <div className={`flex items-center justify-between py-1 ${!allowPublicRegistration ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Require admin approval on register</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      New accounts must be approved before they can sign in
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!allowPublicRegistration}
                    onClick={() => setRequireAccountActivation((v) => !v)}
                    className={`w-11 h-6 rounded-full relative shrink-0 transition-colors disabled:cursor-not-allowed ${requireAccountActivation ? "bg-aurora-600" : "bg-surface-700"}`}
                    aria-pressed={requireAccountActivation}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${requireAccountActivation ? "right-1" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Media Library ── */}
          {step === 3 && (
            <div className="animate-[fadeIn_0.2s_ease-out]">
              <div className="text-center mb-6">
                <h1 className="text-xl font-semibold mb-1">Media library</h1>
                <p className="text-sm text-surface-400">Tell Aurora where your music lives.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Music library path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={musicDir}
                      onChange={(e) => setMusicDir(e.target.value)}
                      required
                      placeholder="/music"
                      className="flex-1 h-10 px-4 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-aurora-500/10 border border-aurora-500/15">
                  <svg className="w-4 h-4 text-aurora-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-aurora-200 leading-relaxed">
                    Supported formats: MP3, FLAC, AAC, OGG, WAV, M4A. Subdirectories are scanned automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* ── NAVIGATION ── */}
          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={step === 1 || loading}
              className="text-sm text-surface-400 hover:text-white transition-colors disabled:opacity-0"
            >
              Back
            </button>
            <button
              type="button"
              onClick={step === 3 ? handleSubmit : next}
              disabled={loading}
              className="h-10 px-6 bg-gradient-to-r from-aurora-600 to-aurora-700 hover:from-aurora-500 hover:to-aurora-600 text-white font-medium rounded-xl shadow-lg shadow-aurora-500/20 hover:shadow-aurora-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up...
                </span>
              ) : step === 3 ? (
                "Complete Setup"
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-surface-600 mt-6">
          Aurora Music — Self-hosted music streaming
        </p>
      </div>

      <DatabaseConnectionDialog
        open={connectionDialogOpen}
        onClose={() => setConnectionDialogOpen(false)}
        driver={databaseDriver}
        databaseUrl={databaseUrl}
        postgresFields={postgresFields}
        sqlitePath={sqlitePath}
        onApply={applyDatabaseConnection}
        onTest={handleTestDatabase}
        testing={dbTesting}
        testMessage={dbTestMessage}
        testError={dbTestError}
      />
    </div>
  );
}
