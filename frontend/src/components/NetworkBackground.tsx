// Human: WebGL aurora background — auth/setup (meteors + focus), library dashboard (calm aurora), with motion and quality fallbacks.
// Agent: MeteorField+quality tier; variant library|auth|default; pause rAF when hidden; STATIC fallback when no WebGL or reduce motion.
import { useEffect, useRef, useState, type RefObject } from "react";
import { NetworkBackgroundGlRenderer, type GlFocusRect } from "./networkBackground/glRenderer";
import {
  STATIC_BACKGROUND_STYLE,
  applyNetworkBackgroundVariant,
  detectBackgroundQualityTier,
  getBackgroundQualitySettings,
  subscribeBackgroundQualityTier,
  type BackgroundQualitySettings,
  type NetworkBackgroundVariant,
} from "./networkBackground/backgroundQuality";
import { MAX_METEORS, MeteorField } from "./networkBackground/meteors";

/** Human: Auth/login drift speed — visible but not frantic. */
// Agent: CONST time multiplier for auth/default draw loop.
const TIME_SCALE_AUTH = 0.34;

/** Human: Library shell moves slower so the dashboard feels ambient, not distracting. */
// Agent: CONST lower time multiplier when variant=library.
const TIME_SCALE_LIBRARY = 0.2;

export interface NetworkBackgroundProps {
  variant?: NetworkBackgroundVariant;
  focusTargetRef?: RefObject<HTMLElement | null>;
}

const DEFAULT_FOCUS: GlFocusRect = {
  centerX: 0.5,
  centerY: 0.5,
  radiusX: 0.32,
  radiusY: 0.28,
  active: false,
};

// Human: Map the login card DOM rect into normalized container space for the GPU focus mask.
// Agent: READS container+target getBoundingClientRect; RETURNS GlFocusRect center+radius active flag.
function measureFocusRect(
  container: HTMLElement,
  focusTarget: HTMLElement | null,
  authMode: boolean,
): GlFocusRect {
  if (!authMode || !focusTarget) {
    return { ...DEFAULT_FOCUS, active: false };
  }

  const containerRect = container.getBoundingClientRect();
  if (containerRect.width <= 0 || containerRect.height <= 0) {
    return { ...DEFAULT_FOCUS, active: false };
  }

  const targetRect = focusTarget.getBoundingClientRect();
  const centerX = (targetRect.left + targetRect.width / 2 - containerRect.left) / containerRect.width;
  const centerY = (targetRect.top + targetRect.height / 2 - containerRect.top) / containerRect.height;
  const radiusX = (targetRect.width / containerRect.width) * 0.58;
  const radiusY = (targetRect.height / containerRect.height) * 0.58;

  return {
    centerX: Math.max(0, Math.min(1, centerX)),
    centerY: Math.max(0, Math.min(1, centerY)),
    radiusX: Math.max(radiusX, 0.14),
    radiusY: Math.max(radiusY, 0.14),
    active: true,
  };
}

// Human: Count GPU meteor slots with non-zero life for uMeteorCount.
// Agent: PURE; READS slots life01; RETURNS count capped by maxSlots.
function countActiveMeteors(slots: { life01: number }[], maxSlots: number): number {
  let count = 0;
  for (let i = 0; i < maxSlots; i++) {
    if (slots[i].life01 > 0.01) count++;
  }
  return count;
}

// Human: Bridge quality tier into meteor spawn limits.
// Agent: PURE; READS BackgroundQualitySettings; RETURNS MeteorFieldConfig.
function meteorConfigFromQuality(quality: BackgroundQualitySettings) {
  return {
    maxConcurrent: quality.maxMeteors,
    spawnCooldownScale: quality.spawnCooldownScale,
    enabled: quality.meteorsEnabled,
  };
}

// Human: Merge device tier with variant-specific caps (library disables meteors, lowers fill rate).
// Agent: PURE; CALLS getBackgroundQualitySettings+applyNetworkBackgroundVariant.
function qualityForVariant(tier = detectBackgroundQualityTier(), variant: NetworkBackgroundVariant) {
  return applyNetworkBackgroundVariant(getBackgroundQualitySettings(tier), variant);
}

// Human: WebGL aurora when allowed; static CSS when reduced motion or WebGL unavailable; mobile cost tier.
// Agent: matchMedia reduce motion; visibility pause; quality subscription; passes libraryMode to renderer.
export default function NetworkBackground({
  variant = "default",
  focusTargetRef,
}: NetworkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRendererRef = useRef<NetworkBackgroundGlRenderer | null>(null);
  const meteorFieldRef = useRef<MeteorField | null>(null);
  const qualityRef = useRef<BackgroundQualitySettings>(qualityForVariant(undefined, variant));
  const variantRef = useRef(variant);

  const authMode = variant === "auth";
  const libraryMode = variant === "library";
  const timeScale = libraryMode ? TIME_SCALE_LIBRARY : TIME_SCALE_AUTH;
  const focusRectRef = useRef<GlFocusRect>(DEFAULT_FOCUS);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [webglActive, setWebglActive] = useState(false);
  const [quality, setQuality] = useState<BackgroundQualitySettings>(() => qualityForVariant(undefined, variant));

  const useAnimatedWebgl = webglActive && !prefersReducedMotion;
  const useStaticFallback = !useAnimatedWebgl;

  useEffect(() => {
    variantRef.current = variant;
    const next = qualityForVariant(detectBackgroundQualityTier(), variant);
    qualityRef.current = next;
    setQuality(next);
  }, [variant]);

  useEffect(() => {
    qualityRef.current = quality;
    meteorFieldRef.current?.setConfig(meteorConfigFromQuality(quality));

    const container = containerRef.current;
    if (container && glRendererRef.current) {
      glRendererRef.current.resize(container.clientWidth, container.clientHeight, quality);
    }
  }, [quality]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      setPrefersReducedMotion(motionQuery.matches);
    };

    motionQuery.addEventListener("change", onMotionChange);
    return () => {
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  useEffect(() => {
    return subscribeBackgroundQualityTier((tierSettings) => {
      setQuality(applyNetworkBackgroundVariant(tierSettings, variantRef.current));
    });
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setWebglActive(false);
      glRendererRef.current?.dispose();
      glRendererRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    const containerEl = containerRef.current;
    if (!canvas || !containerEl) return;
    const layoutRoot = containerEl;

    const glRenderer = NetworkBackgroundGlRenderer.create(canvas);
    glRendererRef.current = glRenderer;
    setWebglActive(glRenderer !== null);
    if (!glRenderer) return;

    const renderer = glRenderer;
    const meteorField = new MeteorField();
    meteorField.setConfig(meteorConfigFromQuality(qualityRef.current));
    meteorFieldRef.current = meteorField;

    let animationFrameId = 0;
    let startTime = performance.now();
    let lastFrameTime = startTime;

    function updateFocusRect() {
      focusRectRef.current = measureFocusRect(
        layoutRoot,
        focusTargetRef?.current ?? null,
        authMode,
      );
    }

    function handleLayoutChange(w: number, h: number) {
      if (w <= 0 || h <= 0) return;
      renderer.resize(w, h, qualityRef.current);
      updateFocusRect();
    }

    function drawFrame() {
      if (authMode) {
        updateFocusRect();
      }

      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      const meteorSlots = meteorField.update(dt);

      renderer.render({
        time: ((now - startTime) / 1000) * timeScale,
        focus: focusRectRef.current,
        authMode,
        libraryMode,
        meteors: meteorSlots,
        meteorCount: libraryMode ? 0 : countActiveMeteors(meteorSlots, MAX_METEORS),
        quality: qualityRef.current,
      });
    }

    function stopLoop() {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
    }

    function frame() {
      if (!document.hidden) {
        drawFrame();
        animationFrameId = requestAnimationFrame(frame);
      } else {
        animationFrameId = 0;
      }
    }

    function startLoop() {
      if (animationFrameId || document.hidden) return;
      lastFrameTime = performance.now();
      frame();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stopLoop();
        return;
      }
      lastFrameTime = performance.now();
      drawFrame();
      startLoop();
    }

    const resizeObserver = new ResizeObserver(() => {
      handleLayoutChange(layoutRoot.clientWidth, layoutRoot.clientHeight);
    });

    handleLayoutChange(layoutRoot.clientWidth, layoutRoot.clientHeight);
    startLoop();

    resizeObserver.observe(layoutRoot);
    window.addEventListener("resize", updateFocusRect);
    window.addEventListener("scroll", updateFocusRect, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateFocusRect);
      window.removeEventListener("scroll", updateFocusRect, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderer.dispose();
      glRendererRef.current = null;
      meteorFieldRef.current = null;
    };
  }, [authMode, focusTargetRef, libraryMode, prefersReducedMotion, timeScale]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: useAnimatedWebgl ? "block" : "none" }}
        aria-hidden
      />
      {useStaticFallback && (
        <div className="aurora-glow absolute inset-0" aria-hidden style={STATIC_BACKGROUND_STYLE} />
      )}
    </div>
  );
}
