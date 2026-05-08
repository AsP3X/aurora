import { useState } from "react";
import NetworkBackground from "../components/NetworkBackground";

type Step = 1 | 2 | 3;

export default function SetupWireframe() {
  const [step, setStep] = useState<Step>(1);

  const next = () => setStep((s) => Math.min(s + 1, 3) as Step);
  const back = () => setStep((s) => Math.max(s - 1, 1) as Step);

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
                  <div className="w-full h-10 bg-surface-950 border border-white/10 rounded-xl flex items-center px-4">
                    <span className="text-surface-600 text-sm">admin@company.com</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Password</label>
                  <div className="w-full h-10 bg-surface-950 border border-white/10 rounded-xl flex items-center px-4">
                    <span className="text-surface-600 text-sm">••••••••••••</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">Confirm password</label>
                  <div className="w-full h-10 bg-surface-950 border border-white/10 rounded-xl flex items-center px-4">
                    <span className="text-surface-600 text-sm">••••••••••••</span>
                  </div>
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
                  <div className="w-full h-10 bg-surface-950 border border-white/10 rounded-xl flex items-center px-4">
                    <span className="text-surface-600 text-sm">Aurora Music</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-surface-200">Allow public registration</p>
                    <p className="text-xs text-surface-500 mt-0.5">Anyone can create an account</p>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-aurora-600 relative shrink-0">
                    <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white shadow" />
                  </div>
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
                    <div className="flex-1 h-10 bg-surface-950 border border-white/10 rounded-xl flex items-center px-4">
                      <span className="text-surface-600 text-sm">/var/music</span>
                    </div>
                    <div className="h-10 px-4 bg-surface-800 border border-white/10 rounded-xl flex items-center justify-center text-sm text-surface-300 hover:bg-surface-700 transition-colors">
                      Browse
                    </div>
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

          {/* ── NAVIGATION ── */}
          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={back}
              disabled={step === 1}
              className="text-sm text-surface-400 hover:text-white transition-colors disabled:opacity-0"
            >
              Back
            </button>
            <button
              onClick={next}
              className="h-10 px-6 bg-gradient-to-r from-aurora-600 to-aurora-700 hover:from-aurora-500 hover:to-aurora-600 text-white font-medium rounded-xl shadow-lg shadow-aurora-500/20 hover:shadow-aurora-500/30 transition-all"
            >
              {step === 3 ? "Complete Setup" : "Continue"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-surface-600 mt-6">
          Aurora Music — Self-hosted music streaming
        </p>
      </div>
    </div>
  );
}
