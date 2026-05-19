// Human: WebGL renderer for the auth/setup network background — aurora base, mesh lines, soft points, GPU blur.
// Agent: MULTI-PASS FBO; COMPILES GLSL programs; UPLOADS line/point buffers each frame; DISPOSE on unmount.

export interface GlParticleInput {
  x: number;
  y: number;
  radius: number;
}

export interface GlLineInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

export interface GlFocusRect {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  active: boolean;
}

export interface GlFrameInput {
  width: number;
  height: number;
  time: number;
  particles: GlParticleInput[];
  lines: GlLineInput[];
  mouseLines: GlLineInput[];
  mouse: { x: number; y: number; active: boolean };
  focus: GlFocusRect;
  authMode: boolean;
}

// Human: Expand a line segment into two triangles so the fragment shader can render a thick glowing tube.
// Agent: PURE math; READS endpoints+halfWidth; RETURNS 6 verts × 5 floats (xy, lineCoord.xy, alpha).
function expandLineSegment(line: GlLineInput, halfWidth: number): number[] {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return [];

  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  const { x1, y1, x2, y2, alpha } = line;

  const x1a = x1 - nx;
  const y1a = y1 - ny;
  const x1b = x1 + nx;
  const y1b = y1 + ny;
  const x2a = x2 + nx;
  const y2a = y2 + ny;
  const x2b = x2 - nx;
  const y2b = y2 - ny;

  return [
    x1a, y1a, 0, -1, alpha,
    x1b, y1b, 0, 1, alpha,
    x2a, y2a, 1, 1, alpha,
    x1a, y1a, 0, -1, alpha,
    x2a, y2a, 1, 1, alpha,
    x2b, y2b, 1, -1, alpha,
  ];
}

type GlContext = WebGLRenderingContext | WebGL2RenderingContext;

const AURORA_VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Human: Procedural aurora curtains — autonomous drift; pointer only affects mesh lines, not these blobs.
// Agent: FRAG full-screen; UNIFORMS uTime uResolution; FBM noise bands; grain; OUTPUT opaque RGB.
const AURORA_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 base = vec3(0.059, 0.055, 0.078);

  vec2 flow = vec2(uTime * 0.018, uTime * 0.012);
  float curtain = fbm(vec2(uv.x * 1.6 + flow.x, uv.y * 2.4 - flow.y));
  float band = smoothstep(0.38, 0.82, curtain);
  vec3 violet = vec3(0.545, 0.361, 0.965);
  vec3 deep = vec3(0.424, 0.157, 0.851);
  vec3 aurora = mix(deep, violet, uv.y + 0.08 * sin(uTime * 0.25 + uv.x * 6.28)) * band * 0.24;

  float pulse = 0.04 * sin(uTime * 0.4 + uv.x * 12.0) * smoothstep(0.2, 0.9, uv.y);
  aurora += violet * pulse;

  vec2 centered = (uv - 0.5) * vec2(1.0, 0.85);
  float vignette = 1.0 - dot(centered, centered) * 0.85;

  float grain = (hash(uv * uResolution + uTime) - 0.5) * 0.018;
  vec3 rgb = (base + aurora) * vignette + grain;

  gl_FragColor = vec4(rgb, 1.0);
}
`;

const LINE_VERT = `
attribute vec2 aPosition;
attribute vec2 aLineCoord;
attribute float aAlpha;
uniform vec2 uResolution;
varying vec2 vLineCoord;
varying float vAlpha;
void main() {
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vLineCoord = aLineCoord;
  vAlpha = aAlpha;
}
`;

// Human: Each connection is a soft glowing tube — width falloff, end caps, and a subtle traveling shimmer.
// Agent: FRAG reads vLineCoord.x=along vLineCoord.y=across; smoothstep tube; UNIFORM uTime uColor uGlowBoost.
const LINE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uTime;
uniform float uGlowBoost;
varying vec2 vLineCoord;
varying float vAlpha;

void main() {
  float along = vLineCoord.x;
  float across = abs(vLineCoord.y);

  float tube = smoothstep(1.0, 0.08, across);
  tube = pow(tube, 0.55);

  float endFade = smoothstep(0.0, 0.12, along) * smoothstep(1.0, 0.88, along);
  float shimmer = 0.82 + 0.18 * sin(uTime * 1.8 + along * 14.0);

  float core = smoothstep(0.42, 0.0, across);
  vec3 rgb = mix(uColor, vec3(1.0, 0.98, 1.0), core * 0.45) * (0.75 + core * 0.55);

  float alpha = vAlpha * tube * endFade * shimmer * uGlowBoost;
  gl_FragColor = vec4(rgb * alpha, alpha);
}
`;

const POINT_VERT = `
attribute vec2 aPosition;
attribute float aSize;
attribute float aAlpha;
uniform vec2 uResolution;
varying float vAlpha;
void main() {
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = aSize;
  vAlpha = aAlpha;
}
`;

// Human: Balanced node marker — moderate halo with a clear core; visible after blur without dominating lines.
// Agent: FRAG smoothstep halo 0.5→0.18; core 0.15→0; UNIFORM uCoreMix for pass tuning.
const POINT_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uCoreMix;
varying float vAlpha;
void main() {
  vec2 centered = gl_PointCoord - 0.5;
  float dist = length(centered);
  if (dist > 0.5) discard;

  float halo = smoothstep(0.5, 0.18, dist);
  float core = smoothstep(0.15, 0.0, dist);
  halo = pow(halo, 0.85);

  vec3 coreColor = vec3(1.0, 0.99, 1.0);
  vec3 rgb = mix(uColor * (halo * 1.05), coreColor, core * uCoreMix);
  float alpha = vAlpha * (halo * 0.78 + core * 0.9);
  gl_FragColor = vec4(rgb, min(alpha, 1.0));
}
`;

const BLUR_VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Human: Separable 9-tap Gaussian — cheap post blur that replaces CSS filter for smoother scaling.
// Agent: FRAG samples uTexture along uDirection with fixed weights; UNIFORM uTexelSize.
const BLUR_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uDirection;

void main() {
  vec2 off = uDirection * uTexelSize;
  vec4 sum = texture2D(uTexture, vUv) * 0.227027;
  sum += texture2D(uTexture, vUv + off * 1.0) * 0.1945946;
  sum += texture2D(uTexture, vUv - off * 1.0) * 0.1945946;
  sum += texture2D(uTexture, vUv + off * 2.0) * 0.1216216;
  sum += texture2D(uTexture, vUv - off * 2.0) * 0.1216216;
  sum += texture2D(uTexture, vUv + off * 3.0) * 0.054054;
  sum += texture2D(uTexture, vUv - off * 3.0) * 0.054054;
  sum += texture2D(uTexture, vUv + off * 4.0) * 0.016216;
  sum += texture2D(uTexture, vUv - off * 4.0) * 0.016216;
  gl_FragColor = sum;
}
`;

// Human: Pull bright aurora pixels into a bloom buffer — mesh is composited later, unblurred.
// Agent: FRAG samples uTexture (aurora layer); threshold luminance; OUTPUT rgb bloom seed.
const BLOOM_EXTRACT_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;

void main() {
  vec3 col = texture2D(uTexture, vUv).rgb;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float soft = max(0.0, luma - 0.28);
  vec3 bloom = col * soft * 1.65;
  gl_FragColor = vec4(bloom, 1.0);
}
`;

// Human: Blurred aurora + bloom + auth focus scrim — background layer only; mesh draws sharp on top after.
// Agent: FRAG samples uTexture (aurora) + uBloomTexture; UNIFORMS focus + bloom; no mesh in input.
const COMPOSITE_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform sampler2D uBloomTexture;
uniform vec2 uResolution;
uniform vec2 uFocusCenter;
uniform vec2 uFocusRadius;
uniform float uFocusActive;
uniform float uBloomStrength;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 scene = texture2D(uTexture, vUv).rgb;
  vec3 bloom = texture2D(uBloomTexture, vUv).rgb;
  vec3 col = scene + bloom * uBloomStrength;

  if (uFocusActive > 0.5) {
    vec2 focusCenter = vec2(uFocusCenter.x, 1.0 - uFocusCenter.y);
    vec2 focusUv = vUv - focusCenter;
    focusUv.x *= uResolution.x / max(uResolution.y, 1.0);
    vec2 normRadius = max(uFocusRadius, vec2(0.08));
    float focusDist = length(focusUv / normRadius);
    float focusMask = smoothstep(0.42, 1.05, focusDist);
    col *= mix(0.68, 1.0, focusMask);
  }

  float bottomScrim = smoothstep(0.48, 1.0, vUv.y);
  col *= mix(1.0, 0.72, bottomScrim * 0.38);

  col += (hash(vUv * uResolution + uTime) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

const QUAD_POSITIONS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

const LINE_COLOR: [number, number, number] = [0.655, 0.545, 0.98];
const MOUSE_LINE_COLOR: [number, number, number] = [0.847, 0.784, 1.0];
const POINT_COLOR: [number, number, number] = [0.847, 0.784, 1.0];

interface GlProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  attribs: Record<string, number>;
}

interface FramebufferTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

function compileShader(gl: GlContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: GlContext, vertSource: string, fragSource: string): GlProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vert || !frag) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const uniformNames = [
    "uTime", "uResolution", "uColor", "uTexture", "uBloomTexture", "uTexelSize", "uDirection",
    "uGlowBoost", "uCoreMix", "uMouse", "uMouseActive", "uFocusCenter", "uFocusRadius",
    "uFocusActive", "uBloomStrength",
  ];
  const attribNames = ["aPosition", "aAlpha", "aSize", "aLineCoord"];

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  const attribs: Record<string, number> = {};
  for (const name of attribNames) {
    attribs[name] = gl.getAttribLocation(program, name);
  }

  return { program, uniforms, attribs };
}

function createFramebuffer(gl: GlContext, width: number, height: number): FramebufferTarget | null {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    return null;
  }

  return { framebuffer, texture, width, height };
}

function resizeFramebuffer(gl: GlContext, target: FramebufferTarget, width: number, height: number) {
  if (target.width === width && target.height === height) return;
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function bindProgram(gl: GlContext, bundle: GlProgram) {
  gl.useProgram(bundle.program);
}

export class NetworkBackgroundGlRenderer {
  private readonly gl: GlContext;
  private readonly auroraProgram: GlProgram;
  private readonly lineProgram: GlProgram;
  private readonly pointProgram: GlProgram;
  private readonly blurProgram: GlProgram;
  private readonly bloomExtractProgram: GlProgram;
  private readonly compositeProgram: GlProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly lineBuffer: WebGLBuffer;
  private readonly pointBuffer: WebGLBuffer;
  private sceneTarget: FramebufferTarget;
  private blurTarget: FramebufferTarget;
  private bloomTarget: FramebufferTarget;
  private width = 0;
  private height = 0;
  private dpr = 1;

  private constructor(
    gl: GlContext,
    auroraProgram: GlProgram,
    lineProgram: GlProgram,
    pointProgram: GlProgram,
    blurProgram: GlProgram,
    bloomExtractProgram: GlProgram,
    compositeProgram: GlProgram,
    quadBuffer: WebGLBuffer,
    lineBuffer: WebGLBuffer,
    pointBuffer: WebGLBuffer,
    sceneTarget: FramebufferTarget,
    blurTarget: FramebufferTarget,
    bloomTarget: FramebufferTarget,
  ) {
    this.gl = gl;
    this.auroraProgram = auroraProgram;
    this.lineProgram = lineProgram;
    this.pointProgram = pointProgram;
    this.blurProgram = blurProgram;
    this.bloomExtractProgram = bloomExtractProgram;
    this.compositeProgram = compositeProgram;
    this.quadBuffer = quadBuffer;
    this.lineBuffer = lineBuffer;
    this.pointBuffer = pointBuffer;
    this.sceneTarget = sceneTarget;
    this.blurTarget = blurTarget;
    this.bloomTarget = bloomTarget;
  }

  // Human: Factory tries WebGL first; returns null when shaders or FBO setup fail so caller can fall back to 2D.
  // Agent: CREATES context+programs+FBOs; RETURNS NetworkBackgroundGlRenderer|null.
  static create(canvas: HTMLCanvasElement): NetworkBackgroundGlRenderer | null {
    const gl =
      (canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      }) as GlContext | null) ??
      (canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      }) as GlContext | null);

    if (!gl) return null;

    const auroraProgram = createProgram(gl, AURORA_VERT, AURORA_FRAG);
    const lineProgram = createProgram(gl, LINE_VERT, LINE_FRAG);
    const pointProgram = createProgram(gl, POINT_VERT, POINT_FRAG);
    const blurProgram = createProgram(gl, BLUR_VERT, BLUR_FRAG);
    const bloomExtractProgram = createProgram(gl, BLUR_VERT, BLOOM_EXTRACT_FRAG);
    const compositeProgram = createProgram(gl, BLUR_VERT, COMPOSITE_FRAG);
    if (!auroraProgram || !lineProgram || !pointProgram || !blurProgram || !bloomExtractProgram || !compositeProgram) {
      return null;
    }

    const quadBuffer = gl.createBuffer();
    const lineBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();
    if (!quadBuffer || !lineBuffer || !pointBuffer) return null;

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITIONS, gl.STATIC_DRAW);

    const sceneTarget = createFramebuffer(gl, 4, 4);
    const blurTarget = createFramebuffer(gl, 4, 4);
    const bloomTarget = createFramebuffer(gl, 4, 4);
    if (!sceneTarget || !blurTarget || !bloomTarget) return null;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return new NetworkBackgroundGlRenderer(
      gl,
      auroraProgram,
      lineProgram,
      pointProgram,
      blurProgram,
      bloomExtractProgram,
      compositeProgram,
      quadBuffer,
      lineBuffer,
      pointBuffer,
      sceneTarget,
      blurTarget,
      bloomTarget,
    );
  }

  // Human: Match canvas backing store to container CSS size and rebuild FBO textures when dimensions change.
  // Agent: SETS canvas.width/height; RESIZES scene+blur FBOs; STORES dpr for point sizing.
  resize(cssWidth: number, cssHeight: number) {
    if (cssWidth <= 0 || cssHeight <= 0) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(cssWidth * this.dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * this.dpr));

    const canvas = this.gl.canvas as HTMLCanvasElement;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    this.width = pixelWidth;
    this.height = pixelHeight;

    resizeFramebuffer(this.gl, this.sceneTarget, pixelWidth, pixelHeight);
    resizeFramebuffer(this.gl, this.blurTarget, pixelWidth, pixelHeight);
    resizeFramebuffer(this.gl, this.bloomTarget, pixelWidth, pixelHeight);

    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  // Human: Aurora-only → blur blobs → bloom → composite background → sharp mesh overlay (mouse lines only on mesh).
  // Agent: sceneTarget=aurora; blur aurora; composite to screen; drawLines/drawPoints on default FB unblurred.
  render(frame: GlFrameInput) {
    if (this.width <= 0 || this.height <= 0) return;

    const gl = this.gl;
    const resolution: [number, number] = [this.width, this.height];
    const auroraBlurStrength = 2.6;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    bindProgram(gl, this.auroraProgram);
    gl.uniform1f(this.auroraProgram.uniforms.uTime!, frame.time);
    gl.uniform2f(this.auroraProgram.uniforms.uResolution!, resolution[0], resolution[1]);
    this.drawQuad(this.auroraProgram);

    this.runBloomPipeline();
    this.runBlurBetween(this.sceneTarget, this.blurTarget, auroraBlurStrength, 1, 0);
    this.runBlurBetween(this.blurTarget, this.sceneTarget, auroraBlurStrength, 0, 1);

    this.runCompositePass(frame, resolution, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.drawLines(frame.lines, LINE_COLOR, 1.65, 1.0, frame.time);
    this.drawLines(frame.mouseLines, MOUSE_LINE_COLOR, 2.4, 1.35, frame.time);
    this.drawPoints(frame.particles);
  }

  // Human: Threshold bright scene pixels, then separable blur for bloom halo.
  // Agent: sceneTarget → bloomTarget extract; blur H/V ping-pong blurTarget↔bloomTarget.
  private runBloomPipeline() {
    const gl = this.gl;
    const bloomStrength = 3.2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomTarget.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    bindProgram(gl, this.bloomExtractProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
    gl.uniform1i(this.bloomExtractProgram.uniforms.uTexture!, 0);
    this.drawQuad(this.bloomExtractProgram);

    this.runBlurBetween(this.bloomTarget, this.blurTarget, bloomStrength, 1, 0);
    this.runBlurBetween(this.blurTarget, this.bloomTarget, bloomStrength, 0, 1);
  }

  // Human: Merge blurred aurora and bloom, apply auth focus scrim — writes to screen or an FBO.
  // Agent: DRAW compositeProgram; SAMPLING sceneTarget (blurred aurora) + bloomTarget; SETS focus uniforms.
  private runCompositePass(
    frame: GlFrameInput,
    resolution: [number, number],
    target: FramebufferTarget | null,
  ) {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, this.width, this.height);
    if (!target) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    bindProgram(gl, this.compositeProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
    gl.uniform1i(this.compositeProgram.uniforms.uTexture!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTarget.texture);
    gl.uniform1i(this.compositeProgram.uniforms.uBloomTexture!, 1);

    gl.uniform2f(this.compositeProgram.uniforms.uResolution!, resolution[0], resolution[1]);
    gl.uniform1f(this.compositeProgram.uniforms.uBloomStrength!, frame.authMode ? 0.85 : 0.65);
    gl.uniform1f(this.compositeProgram.uniforms.uTime!, frame.time);

    const focusActive = frame.authMode && frame.focus.active ? 1 : 0;
    gl.uniform1f(this.compositeProgram.uniforms.uFocusActive!, focusActive);
    gl.uniform2f(this.compositeProgram.uniforms.uFocusCenter!, frame.focus.centerX, frame.focus.centerY);
    gl.uniform2f(
      this.compositeProgram.uniforms.uFocusRadius!,
      Math.max(frame.focus.radiusX, 0.12),
      Math.max(frame.focus.radiusY, 0.12),
    );

    this.drawQuad(this.compositeProgram);
  }

  private runBlurBetween(
    source: FramebufferTarget,
    destination: FramebufferTarget,
    strength: number,
    dirX: number,
    dirY: number,
  ) {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    bindProgram(gl, this.blurProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(this.blurProgram.uniforms.uTexture!, 0);
    gl.uniform2f(this.blurProgram.uniforms.uTexelSize!, strength / this.width, strength / this.height);
    gl.uniform2f(this.blurProgram.uniforms.uDirection!, dirX, dirY);
    this.drawQuad(this.blurProgram);
  }

  private drawQuad(bundle: GlProgram) {
    const gl = this.gl;
    bindProgram(gl, bundle);
    const loc = bundle.attribs.aPosition;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
  }

  // Human: Thick line quads with shader tube glow — avoids GL_LINES which renders as 1px on most GPUs.
  // Agent: EXPANDS each segment to 6 verts; DRAW TRIANGLES; UNIFORMS uTime uGlowBoost uColor uResolution.
  private drawLines(
    lines: GlLineInput[],
    color: [number, number, number],
    halfWidthCss: number,
    glowBoost: number,
    time: number,
  ) {
    if (lines.length === 0) return;

    const gl = this.gl;
    const halfWidth = halfWidthCss * this.dpr;
    const scratch: number[] = [];
    for (const line of lines) {
      scratch.push(...expandLineSegment(line, halfWidth));
    }
    if (scratch.length === 0) return;

    bindProgram(gl, this.lineProgram);
    gl.uniform2f(this.lineProgram.uniforms.uResolution!, this.width, this.height);
    gl.uniform3f(this.lineProgram.uniforms.uColor!, color[0], color[1], color[2]);
    gl.uniform1f(this.lineProgram.uniforms.uTime!, time);
    gl.uniform1f(this.lineProgram.uniforms.uGlowBoost!, glowBoost);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(scratch), gl.DYNAMIC_DRAW);

    const stride = 5 * 4;
    const posLoc = this.lineProgram.attribs.aPosition;
    const lineCoordLoc = this.lineProgram.attribs.aLineCoord;
    const alphaLoc = this.lineProgram.attribs.aAlpha;
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(lineCoordLoc);
    gl.enableVertexAttribArray(alphaLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(lineCoordLoc, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, stride, 16);
    gl.drawArrays(gl.TRIANGLES, 0, scratch.length / 5);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(lineCoordLoc);
    gl.disableVertexAttribArray(alphaLoc);
  }

  // Human: Two moderate passes — soft outer glow plus a defined core, sized between the previous extremes.
  // Agent: PASS1 sizeScale 5.8 additive halo; PASS2 sizeScale 3.6 normal core; cap 80px.
  private drawPoints(particles: GlParticleInput[]) {
    if (particles.length === 0) return;

    const gl = this.gl;
    this.uploadAndDrawPointPass(particles, 5.8, 0.4, 0.25, gl.ONE);
    this.uploadAndDrawPointPass(particles, 3.6, 0.92, 0.9, gl.ONE_MINUS_SRC_ALPHA);
  }

  private uploadAndDrawPointPass(
    particles: GlParticleInput[],
    sizeScale: number,
    alphaScale: number,
    coreMix: number,
    blendAlpha: number,
  ) {
    const gl = this.gl;
    gl.blendFunc(gl.SRC_ALPHA, blendAlpha);

    const data = new Float32Array(particles.length * 4);
    let offset = 0;
    for (const particle of particles) {
      data[offset++] = particle.x;
      data[offset++] = particle.y;
      data[offset++] = Math.min(particle.radius * sizeScale * this.dpr, 80);
      data[offset++] = alphaScale;
    }

    bindProgram(gl, this.pointProgram);
    gl.uniform2f(this.pointProgram.uniforms.uResolution!, this.width, this.height);
    gl.uniform3f(this.pointProgram.uniforms.uColor!, POINT_COLOR[0], POINT_COLOR[1], POINT_COLOR[2]);
    gl.uniform1f(this.pointProgram.uniforms.uCoreMix!, coreMix);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const stride = 4 * 4;
    const posLoc = this.pointProgram.attribs.aPosition;
    const sizeLoc = this.pointProgram.attribs.aSize;
    const alphaLoc = this.pointProgram.attribs.aAlpha;
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(sizeLoc);
    gl.enableVertexAttribArray(alphaLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, stride, 12);
    gl.drawArrays(gl.POINTS, 0, particles.length);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(sizeLoc);
    gl.disableVertexAttribArray(alphaLoc);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.auroraProgram.program);
    gl.deleteProgram(this.lineProgram.program);
    gl.deleteProgram(this.pointProgram.program);
    gl.deleteProgram(this.blurProgram.program);
    gl.deleteProgram(this.bloomExtractProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.lineBuffer);
    gl.deleteBuffer(this.pointBuffer);
    gl.deleteFramebuffer(this.sceneTarget.framebuffer);
    gl.deleteTexture(this.sceneTarget.texture);
    gl.deleteFramebuffer(this.blurTarget.framebuffer);
    gl.deleteTexture(this.blurTarget.texture);
    gl.deleteFramebuffer(this.bloomTarget.framebuffer);
    gl.deleteTexture(this.bloomTarget.texture);
  }
}
