// Human: Auth/setup background — aurora, sporadic meteors, horizon, hills; CSS fallback if no WebGL.
// Agent: PROPS variant focusTargetRef; MeteorField real-time dt; TIME_SCALE on aurora uTime only.
import { useEffect, useRef, useState, type RefObject } from "react";
import { NetworkBackgroundGlRenderer, type GlFocusRect } from "./networkBackground/glRenderer";
import { MAX_METEORS, MeteorField } from "./networkBackground/meteors";

/** Scales shader time — lower = slower aurora/silhouette drift (reduces motion discomfort). */
const TIME_SCALE = 0.34;

export interface NetworkBackgroundProps {
  variant?: "default" | "auth";
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

// Human: Aurora, mineral meteors, horizon hills; auth variant dims around the login/setup card.
// Agent: WEBGL bloom+composite; MeteorField per frame; CSS gradient fallback when WebGL unavailable.
export default function NetworkBackground({
  variant = "default",
  focusTargetRef,
}: NetworkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const authMode = variant === "auth";
  const focusRectRef = useRef<GlFocusRect>(DEFAULT_FOCUS);
  const [webglActive, setWebglActive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const glRenderer = NetworkBackgroundGlRenderer.create(canvas);
    setWebglActive(glRenderer !== null);

    let animationFrameId = 0;
    let startTime = performance.now();
    let lastFrameTime = startTime;
    const meteorField = new MeteorField();

    function updateFocusRect() {
      focusRectRef.current = measureFocusRect(
        container!,
        focusTargetRef?.current ?? null,
        authMode,
      );
    }

    function handleLayoutChange(w: number, h: number) {
      if (w <= 0 || h <= 0) return;
      glRenderer?.resize(w, h);
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
      let meteorCount = 0;
      for (let i = 0; i < MAX_METEORS; i++) {
        if (meteorSlots[i].life01 > 0.01) meteorCount++;
      }

      glRenderer?.render({
        time: ((now - startTime) / 1000) * TIME_SCALE,
        focus: focusRectRef.current,
        authMode,
        meteors: meteorSlots,
        meteorCount,
      });
    }

    function animate() {
      drawFrame();
      animationFrameId = requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(() => {
      handleLayoutChange(container.clientWidth, container.clientHeight);
    });

    handleLayoutChange(container.clientWidth, container.clientHeight);
    if (glRenderer) {
      animate();
    }

    resizeObserver.observe(container);
    window.addEventListener("resize", updateFocusRect);
    window.addEventListener("scroll", updateFocusRect, true);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateFocusRect);
      window.removeEventListener("scroll", updateFocusRect, true);
      glRenderer?.dispose();
    };
  }, [authMode, focusTargetRef]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: webglActive ? "block" : "none" }}
      />
      {!webglActive && (
        <div
          className="aurora-glow absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(139, 92, 246, 0.18), transparent 60%), radial-gradient(ellipse 70% 22% at 50% 88%, rgba(124, 58, 237, 0.2), transparent 70%), linear-gradient(180deg, #0f0e14 0%, #12101a 45%, #08070c 100%)",
          }}
        />
      )}
    </div>
  );
}
