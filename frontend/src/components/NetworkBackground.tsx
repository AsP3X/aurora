// Human: Full-viewport background for auth/setup — WebGL aurora, bloom, focus mask; 2D canvas fallback.
// Agent: PROPS variant auth + focusTargetRef; rAF; ResizeObserver; passes mouse/focus to glRenderer.
import { useEffect, useRef, type RefObject } from "react";
import {
  NetworkBackgroundGlRenderer,
  type GlFocusRect,
  type GlLineInput,
  type GlParticleInput,
} from "./networkBackground/glRenderer";

export interface NetworkBackgroundProps {
  variant?: "default" | "auth";
  focusTargetRef?: RefObject<HTMLElement | null>;
}

interface Particle {
  nx: number;
  ny: number;
  nvx: number;
  nvy: number;
  radius: number;
}

interface Layout {
  w: number;
  h: number;
  dotCount: number;
  connectionDist: number;
  mouseDist: number;
  maxConnections: number;
}

const DEFAULT_FOCUS: GlFocusRect = {
  centerX: 0.5,
  centerY: 0.5,
  radiusX: 0.32,
  radiusY: 0.28,
  active: false,
};

function computeLayout(w: number, h: number): Layout {
  const minDim = Math.min(w, h);
  const area = w * h;
  const isCompact = w < 480;

  return {
    w,
    h,
    dotCount: Math.round(Math.min(80, Math.max(28, area / 11_000))),
    connectionDist: minDim * (isCompact ? 0.2 : 0.24),
    mouseDist: minDim * 0.3,
    maxConnections: isCompact ? 2 : 3,
  };
}

function createParticle(): Particle {
  return {
    nx: Math.random(),
    ny: Math.random(),
    nvx: (Math.random() - 0.5) * 0.00035,
    nvy: (Math.random() - 0.5) * 0.00035,
    radius: Math.random() * 1.1 + 1.05,
  };
}

function syncParticleCount(particles: Particle[], target: number) {
  while (particles.length < target) {
    particles.push(createParticle());
  }
  while (particles.length > target) {
    particles.pop();
  }
}

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

function buildFrameGeometry(
  particles: Particle[],
  layout: Layout,
  mouse: { x: number; y: number },
  dpr: number,
): { lines: GlLineInput[]; mouseLines: GlLineInput[]; glParticles: GlParticleInput[] } {
  const { w, h, connectionDist, mouseDist, maxConnections } = layout;
  const lines: GlLineInput[] = [];
  const mouseLines: GlLineInput[] = [];

  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    const ax = a.nx * w;
    const ay = a.ny * h;

    const candidates: { j: number; dist: number }[] = [];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dist = Math.hypot(ax - b.nx * w, ay - b.ny * h);
      if (dist < connectionDist) candidates.push({ j, dist });
    }

    candidates.sort((left, right) => left.dist - right.dist);
    for (const { j, dist } of candidates.slice(0, maxConnections)) {
      const b = particles[j];
      lines.push({
        x1: ax * dpr,
        y1: ay * dpr,
        x2: b.nx * w * dpr,
        y2: b.ny * h * dpr,
        alpha: (1 - dist / connectionDist) * 0.72,
      });
    }
  }

  for (const p of particles) {
    const px = p.nx * w;
    const py = p.ny * h;
    const dist = Math.hypot(px - mouse.x, py - mouse.y);
    if (dist < mouseDist) {
      mouseLines.push({
        x1: px * dpr,
        y1: py * dpr,
        x2: mouse.x * dpr,
        y2: mouse.y * dpr,
        alpha: (1 - dist / mouseDist) * 0.82,
      });
    }
  }

  const glParticles = particles.map((p) => ({
    x: p.nx * w * dpr,
    y: p.ny * h * dpr,
    radius: p.radius,
  }));

  return { lines, mouseLines, glParticles };
}

function drawCanvas2DFallback(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  layout: Layout,
  mouse: { x: number; y: number },
) {
  const { w, h, connectionDist, mouseDist, maxConnections } = layout;
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    const ax = a.nx * w;
    const ay = a.ny * h;

    const candidates: { j: number; dist: number }[] = [];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dist = Math.hypot(ax - b.nx * w, ay - b.ny * h);
      if (dist < connectionDist) candidates.push({ j, dist });
    }

    candidates.sort((left, right) => left.dist - right.dist);
    for (const { j, dist } of candidates.slice(0, maxConnections)) {
      const b = particles[j];
      const opacity = (1 - dist / connectionDist) * 0.4;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(167, 139, 250, ${opacity})`;
      ctx.lineWidth = 1;
      ctx.moveTo(ax, ay);
      ctx.lineTo(b.nx * w, b.ny * h);
      ctx.stroke();
    }
  }

  for (const p of particles) {
    const px = p.nx * w;
    const py = p.ny * h;
    const dist = Math.hypot(px - mouse.x, py - mouse.y);
    if (dist < mouseDist) {
      const opacity = (1 - dist / mouseDist) * 0.5;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(216, 200, 255, ${opacity})`;
      ctx.lineWidth = 1.2;
      ctx.moveTo(px, py);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
    }
  }

  for (const p of particles) {
    const px = p.nx * w;
    const py = p.ny * h;
    ctx.beginPath();
    ctx.arc(px, py, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(216, 200, 255, 0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, p.radius * 2.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(167, 139, 250, 0.11)";
    ctx.fill();
  }
}

// Human: Decorative aurora-themed network mesh; auth variant enables GPU focus mask around the login card.
// Agent: WEBGL bloom+composite; PROPS variant focusTargetRef; CANVAS 2d fallback with CSS blur.
export default function NetworkBackground({
  variant = "default",
  focusTargetRef,
}: NetworkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const authMode = variant === "auth";
  const focusRectRef = useRef<GlFocusRect>(DEFAULT_FOCUS);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const glRenderer = NetworkBackgroundGlRenderer.create(canvas);
    const ctx = glRenderer ? null : canvas.getContext("2d");
    if (!glRenderer && !ctx) return;

    let animationFrameId = 0;
    let particles: Particle[] = [];
    let layout = computeLayout(window.innerWidth, window.innerHeight);
    let mouse = { x: -10_000, y: -10_000 };
    let startTime = performance.now();
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

    function updateFocusRect() {
      focusRectRef.current = measureFocusRect(
        container!,
        focusTargetRef?.current ?? null,
        authMode,
      );
    }

    function applyCanvasSize(next: Layout) {
      if (glRenderer) {
        glRenderer.resize(next.w, next.h);
        return;
      }
      const scale = dpr();
      canvas!.width = Math.max(1, Math.round(next.w * scale));
      canvas!.height = Math.max(1, Math.round(next.h * scale));
      ctx!.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function handleLayoutChange(w: number, h: number) {
      if (w <= 0 || h <= 0) return;
      layout = computeLayout(w, h);
      applyCanvasSize(layout);
      syncParticleCount(particles, layout.dotCount);
      updateFocusRect();
    }

    function updateParticles() {
      for (const p of particles) {
        p.nx += p.nvx;
        p.ny += p.nvy;

        if (p.nx <= 0 || p.nx >= 1) {
          p.nvx *= -1;
          p.nx = Math.max(0, Math.min(1, p.nx));
        }
        if (p.ny <= 0 || p.ny >= 1) {
          p.nvy *= -1;
          p.ny = Math.max(0, Math.min(1, p.ny));
        }
      }
    }

    function drawFrame() {
      if (authMode) {
        updateFocusRect();
      }

      const pointerActive = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= layout.w && mouse.y <= layout.h;

      if (glRenderer) {
        const scale = dpr();
        const { lines, mouseLines, glParticles } = buildFrameGeometry(particles, layout, mouse, scale);
        glRenderer.render({
          width: layout.w * scale,
          height: layout.h * scale,
          time: (performance.now() - startTime) / 1000,
          particles: glParticles,
          lines,
          mouseLines,
          mouse: { x: mouse.x, y: mouse.y, active: pointerActive },
          focus: focusRectRef.current,
          authMode,
        });
        return;
      }
      drawCanvas2DFallback(ctx!, particles, layout, mouse);
    }

    function animate() {
      updateParticles();
      drawFrame();
      animationFrameId = requestAnimationFrame(animate);
    }

    function handlePointerMove(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = clientX - rect.left;
      mouse.y = clientY - rect.top;
    }

    function handleMouseMove(e: MouseEvent) {
      handlePointerMove(e.clientX, e.clientY);
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 0) return;
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }

    function handlePointerLeave() {
      mouse.x = -10_000;
      mouse.y = -10_000;
    }

    const resizeObserver = new ResizeObserver(() => {
      handleLayoutChange(container.clientWidth, container.clientHeight);
    });

    handleLayoutChange(container.clientWidth, container.clientHeight);
    if (!glRenderer) {
      canvas.style.filter = "blur(5px)";
    }
    animate();

    resizeObserver.observe(container);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("mouseleave", handlePointerLeave);
    window.addEventListener("resize", updateFocusRect);
    window.addEventListener("scroll", updateFocusRect, true);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseleave", handlePointerLeave);
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
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
