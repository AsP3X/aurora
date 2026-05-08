import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setup } from "../api/client";
import { useAuth } from "../context/AuthContext";
import NetworkBackground from "../components/NetworkBackground";

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
  const [musicDir, setMusicDir] = useState("/music");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateStep1(): string | null {
    if (!email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  function validateStep2(): string | null {
    if (!instanceName.trim()) return "Instance name is required";
    return null;
  }

  function validateStep3(): string | null {
    if (!musicDir.trim()) return "Music library path is required";
    return null;
  }

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
        music_dir: musicDir.trim(),
      });
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

                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-surface-200">Allow public registration</p>
                    <p className="text-xs text-surface-500 mt-0.5">Anyone can create an account</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllowPublicRegistration((v) => !v)}
                    className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${allowPublicRegistration ? "bg-aurora-600" : "bg-surface-700"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${allowPublicRegistration ? "right-1" : "left-1"}`} />
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
    </div>
  );
}
