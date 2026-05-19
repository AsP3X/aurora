// Human: Quality tiers for the auth WebGL background — desktop vs mobile/coarse pointer tuning.
// Agent: detectBackgroundQualityTier; getBackgroundQualitySettings; STATIC_BACKGROUND_STYLE for CSS fallback.

import { MAX_METEORS } from "./meteors";

export type BackgroundQualityTier = "high" | "low";

/** Tunables passed from React into the renderer and meteor simulation each frame. */
export interface BackgroundQualitySettings {
  tier: BackgroundQualityTier;
  pixelRatioCap: number;
  renderScale: number;
  auroraBlurStrength: number;
  bloomBlurStrength: number;
  bloomStrengthMultiplier: number;
  maxMeteors: number;
  spawnCooldownScale: number;
  meteorsEnabled: boolean;
}

// Human: Shared static gradient when WebGL is off or prefers-reduced-motion is enabled.
// Agent: CSS background string; USED by NetworkBackground fallback div.
export const STATIC_BACKGROUND_STYLE = {
  background:
    "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(139, 92, 246, 0.18), transparent 60%), radial-gradient(ellipse 70% 22% at 50% 88%, rgba(124, 58, 237, 0.2), transparent 70%), linear-gradient(180deg, #0f0e14 0%, #12101a 45%, #08070c 100%)",
} as const;

const HIGH_QUALITY: BackgroundQualitySettings = {
  tier: "high",
  pixelRatioCap: 2,
  renderScale: 1,
  auroraBlurStrength: 2.6,
  bloomBlurStrength: 3.2,
  bloomStrengthMultiplier: 1,
  maxMeteors: MAX_METEORS,
  spawnCooldownScale: 1,
  meteorsEnabled: true,
};

const LOW_QUALITY: BackgroundQualitySettings = {
  tier: "low",
  pixelRatioCap: 1.25,
  renderScale: 0.55,
  auroraBlurStrength: 1.85,
  bloomBlurStrength: 2,
  bloomStrengthMultiplier: 0.72,
  maxMeteors: 4,
  spawnCooldownScale: 1.75,
  meteorsEnabled: true,
};

// Human: Treat phones, tablets, coarse pointers, and low deviceMemory as the economy tier.
// Agent: READS matchMedia + navigator.deviceMemory; RETURNS high|low.
export function detectBackgroundQualityTier(): BackgroundQualityTier {
  if (typeof window === "undefined") {
    return "high";
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = window.matchMedia("(max-width: 768px)").matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowMemory = deviceMemory !== undefined && deviceMemory <= 4;

  if (coarsePointer || narrowViewport || lowMemory) {
    return "low";
  }

  return "high";
}

// Human: Map tier to renderer and meteor tunables — half-res FBO on low tier saves fill rate.
// Agent: PURE; tier→BackgroundQualitySettings; high=defaults low=reduced DPR/blur/meteors.
export function getBackgroundQualitySettings(tier: BackgroundQualityTier): BackgroundQualitySettings {
  return tier === "low" ? { ...LOW_QUALITY } : { ...HIGH_QUALITY };
}

// Human: Subscribe to viewport/pointer changes so rotating a phone can switch tiers live.
// Agent: CALLS onChange(detect+get); RETURNS cleanup removing media listeners.
export function subscribeBackgroundQualityTier(onChange: (settings: BackgroundQualitySettings) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const media = [
    window.matchMedia("(max-width: 768px)"),
    window.matchMedia("(pointer: coarse)"),
  ];

  const notify = () => {
    onChange(getBackgroundQualitySettings(detectBackgroundQualityTier()));
  };

  for (const query of media) {
    query.addEventListener("change", notify);
  }

  return () => {
    for (const query of media) {
      query.removeEventListener("change", notify);
    }
  };
}
