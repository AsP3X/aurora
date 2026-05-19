// Human: Procedural cover art — nebular aurora WebGL background plus readable title with subtle shader accents.
// Agent: MODULE generateShaderArtwork; RENDERS nebula FBO + title composite; WRITES jpeg Blob.

import { buildArtworkMaskCanvas } from "./artworkTitleMask";

export {
  extractTitleInitials,
  extractTitleLettersOnly,
  normalizeArtworkFooterLines,
  normalizeArtworkFooterMask,
  normalizeArtworkTitleLines,
  normalizeArtworkTitleText,
} from "./artworkTitleMask";

/** Human: Default raster size matches ArtworkCropper max edge so backend WebP pass gets enough pixels. */
// Agent: CONST 1024 px square output.
export const SHADER_ARTWORK_SIZE_PX = 1024;

/** Human: Inputs that drive nebula palette and optional title composite. */
// Agent: seed REQUIRED; title OPTIONAL for mask pass; size defaults SHADER_ARTWORK_SIZE_PX.
export interface GenerateShaderArtworkInput {
  seed: string;
  title?: string;
  artist?: string;
  studio?: string | null;
  album?: string | null;
  year?: number | null;
  size?: number;
}

/** Human: Three normalized scalars derived from the seed string — stable across sessions for the same metadata. */
// Agent: EXPORTED for tests; PURE hash → [0,1]³.
export function hashSeedToUniforms(seed: string): [number, number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + 1), 0x01000193);
    h3 = Math.imul(h3 ^ (c + 2), 0x01000193);
  }
  const norm = (n: number) => (n >>> 0) / 0xffffffff;
  return [norm(h1), norm(h2), norm(h3)];
}

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Human: Soft cosmic nebula — gas clouds, aurora veils, and star dust (seed-tinted, static frame).
// Agent: FRAG; UNIFORMS uResolution uSeed uPhase; FBM nebula layers; OUTPUT opaque RGB.
const NEBULA_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec3 uSeed;
uniform float uPhase;

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
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 centered = uv - 0.5;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uvA = vec2(centered.x * aspect, centered.y);

  vec3 space = vec3(0.02, 0.018, 0.045);

  vec2 nebCenter = vec2(0.48 + uSeed.x * 0.12, 0.42 + uSeed.y * 0.1);
  float radial = 1.0 - smoothstep(0.0, 0.72, length(uvA - nebCenter));
  vec2 cloudUv = uvA * 2.4 + uSeed.xy * 5.0 + vec2(uPhase * 0.3, uPhase * 0.2);
  float clouds = fbm(cloudUv);
  clouds += fbm(cloudUv * 1.9 + 4.2) * 0.55;
  clouds = smoothstep(0.28, 0.92, clouds) * radial;

  vec2 veilUv = uv * vec2(1.2, 2.8) + vec2(uPhase * 0.15, -uPhase * 0.1);
  float veil = fbm(veilUv + vec2(fbm(veilUv * 0.8), 0.0));
  veil *= smoothstep(0.15, 0.85, uv.y) * 0.65;

  vec3 teal = vec3(0.15, 0.75, 0.82);
  vec3 violet = vec3(0.45, 0.22, 0.88);
  vec3 rose = vec3(0.88, 0.32, 0.72);
  float hue = 0.5 + 0.5 * sin(uPhase * 5.0 + clouds * 4.0 + uSeed.z * 6.28);
  vec3 nebulaTint = mix(mix(teal, violet, hue), rose, veil * 0.45);

  vec3 col = space;
  col += nebulaTint * clouds * 0.85;
  col += mix(violet, teal, 0.5) * veil * 0.42;

  float stars = step(0.9975, hash(floor(uv * uResolution * 0.85) + uSeed.xy * 20.0));
  col += vec3(0.9, 0.95, 1.0) * stars * 0.55;

  float vignette = 1.0 - dot(centered, centered) * 1.05;
  col *= clamp(vignette, 0.4, 1.0);

  float grain = (hash(uv * uResolution) - 0.5) * 0.012;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Human: Readable white title over nebula — soft scrim, gentle glow, very light shimmer and edge tint.
// Agent: FRAG; SAMPLER uScene uMask; COMPOSITES solid glyphs + subtle FX only.
const TITLE_COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uMask;
uniform vec2 uResolution;
uniform vec3 uSeed;
uniform float uPhase;

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

float sampleMask(vec2 uv) {
  return texture2D(uMask, uv).r;
}

float maskSoft(vec2 uv) {
  vec2 px = 1.0 / uResolution;
  float s = 0.0;
  s += sampleMask(uv);
  s += sampleMask(uv + px * vec2(4.0, 0.0));
  s += sampleMask(uv - px * vec2(4.0, 0.0));
  s += sampleMask(uv + px * vec2(0.0, 4.0));
  s += sampleMask(uv - px * vec2(0.0, 4.0));
  s += sampleMask(uv + px * vec2(3.0, 3.0));
  s += sampleMask(uv - px * vec2(3.0, 3.0));
  return s / 7.0;
}

void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  float m = sampleMask(vUv);
  vec2 px = 1.0 / uResolution;

  float scrim = smoothstep(0.02, 0.35, maskSoft(vUv));
  vec3 base = mix(scene, scene * 0.42, scrim * 0.55);

  float glow = smoothstep(0.02, 0.28, maskSoft(vUv));
  vec3 glowCol = mix(vec3(0.35, 0.7, 0.95), vec3(0.75, 0.45, 0.95), uSeed.x);
  base += glowCol * glow * 0.22;

  float body = smoothstep(0.62, 0.82, m);
  float shimmer = 0.97 + 0.03 * noise(vUv * 120.0 + uSeed.xy * 8.0 + uPhase);
  vec3 textFill = vec3(0.97, 0.98, 1.0) * body * shimmer;

  float edge = smoothstep(0.12, 0.32, m) - smoothstep(0.45, 0.58, m);
  vec3 edgeTint = vec3(
    sampleMask(vUv + px * vec2(1.2, 0.0)) - sampleMask(vUv - px * vec2(1.2, 0.0)),
    sampleMask(vUv + px * vec2(0.0, 1.2)) - sampleMask(vUv - px * vec2(0.0, 1.2)),
    0.0
  );
  vec3 fringe = vec3(0.55, 0.82, 1.0) * edge * 0.35;
  fringe += vec3(1.0, 0.55, 0.85) * abs(edgeTint) * 0.25;

  float shadow = sampleMask(vUv + px * vec2(0.0, 3.5)) * (1.0 - body);
  base *= 1.0 - shadow * 0.35;

  vec3 col = mix(base, textFill, body);
  col += fringe;
  col += glowCol * body * 0.08;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Human: Passthrough when a song has no title mask — blit the nebula FBO to the canvas.
// Agent: FRAG; SAMPLER uScene; OUTPUT scene rgb.
const SCENE_COPY_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
void main() {
  gl_FragColor = vec4(texture2D(uScene, vUv).rgb, 1.0);
}
`;

type GlContext = WebGLRenderingContext;

interface GlFramebuffer {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

interface GlProgramBundle {
  program: WebGLProgram;
  aPosition: number;
  uniforms: Record<string, WebGLUniformLocation | null>;
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

function createProgram(
  gl: GlContext,
  fragSource: string,
  uniformNames: string[],
): GlProgramBundle | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT);
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

  const aPosition = gl.getAttribLocation(program, "aPosition");
  if (aPosition < 0) {
    gl.deleteProgram(program);
    return null;
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return { program, aPosition, uniforms };
}

function createFramebuffer(gl: GlContext, width: number, height: number): GlFramebuffer | null {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return null;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { framebuffer, texture };
}

function uploadCanvasTexture(gl: GlContext, source: HTMLCanvasElement): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

// Human: Run one fullscreen pass — program must be active before uniforms and texture binds.
// Agent: useProgram(bundle); CALLS setup(); DRAW TRIANGLE_STRIP quad.
function drawPass(
  gl: GlContext,
  bundle: GlProgramBundle,
  buffer: WebGLBuffer,
  setup: () => void,
): void {
  gl.useProgram(bundle.program);
  setup();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(bundle.aPosition);
  gl.vertexAttribPointer(bundle.aPosition, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(bundle.aPosition);
}

function getWebGL(canvas: HTMLCanvasElement): GlContext | null {
  return (
    (canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) as GlContext | null) ??
    (canvas.getContext("experimental-webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) as GlContext | null)
  );
}

// Human: Draw readable title on canvas when WebGL is unavailable — nebula gradient + white type + soft shadow.
// Agent: canvas2d fallback; buildTitleMaskCanvas; fillText-style via mask composite; RETURNS jpeg Blob.
async function generateCanvasFallback(
  size: number,
  seed: string,
  input: GenerateShaderArtworkInput,
): Promise<Blob> {
  const [s0, s1, s2] = hashSeedToUniforms(seed);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D unavailable");
  }

  const hue = Math.round((s0 * 120 + s1 * 80 + s2 * 40) % 360);
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.45,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.75,
  );
  grad.addColorStop(0, `hsl(${hue}, 70%, 35%)`);
  grad.addColorStop(0.45, `hsl(${(hue + 50) % 360}, 65%, 22%)`);
  grad.addColorStop(1, `hsl(${(hue + 100) % 360}, 50%, 8%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const mask = buildArtworkMaskCanvas(
    {
      title: input.title,
      artist: input.artist,
      studio: input.studio,
      album: input.album,
      year: input.year,
    },
    size,
    false,
  );
  if (mask) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 36;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(90, 170, 230, 0.45)";
    ctx.shadowBlur = 16;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();

    const textLayer = document.createElement("canvas");
    textLayer.width = size;
    textLayer.height = size;
    const textCtx = textLayer.getContext("2d");
    if (textCtx) {
      textCtx.drawImage(mask, 0, 0);
      textCtx.globalCompositeOperation = "source-in";
      textCtx.fillStyle = "#f7f8fc";
      textCtx.fillRect(0, 0, size, size);
      ctx.drawImage(textLayer, 0, 0);
    }
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) {
    throw new Error("Failed to encode fallback artwork");
  }
  return blob;
}

// Human: Render nebular background + readable titled composite in WebGL, then encode JPEG.
// Agent: FBO nebula → title composite → toBlob; FALLBACK generateCanvasFallback.
export async function generateShaderArtwork(
  input: GenerateShaderArtworkInput,
): Promise<Blob> {
  const size = input.size ?? SHADER_ARTWORK_SIZE_PX;
  const [s0, s1, s2] = hashSeedToUniforms(input.seed);
  const phase = s0 * 0.7 + s1 * 0.5 + s2 * 0.3;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const gl = getWebGL(canvas);
  if (!gl) {
    return generateCanvasFallback(size, input.seed, input);
  }

  const nebulaProgram = createProgram(gl, NEBULA_FRAG, [
    "uResolution",
    "uSeed",
    "uPhase",
  ]);
  const titleProgram = createProgram(gl, TITLE_COMPOSITE_FRAG, [
    "uScene",
    "uMask",
    "uResolution",
    "uSeed",
    "uPhase",
  ]);
  const copyProgram = createProgram(gl, SCENE_COPY_FRAG, ["uScene"]);
  if (!nebulaProgram || !titleProgram || !copyProgram) {
    return generateCanvasFallback(size, input.seed, input);
  }

  const sceneTarget = createFramebuffer(gl, size, size);
  const buffer = gl.createBuffer();
  if (!sceneTarget || !buffer) {
    return generateCanvasFallback(size, input.seed, input);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawPass(gl, nebulaProgram, buffer, () => {
    gl.uniform2f(nebulaProgram.uniforms.uResolution!, size, size);
    gl.uniform3f(nebulaProgram.uniforms.uSeed!, s0, s1, s2);
    gl.uniform1f(nebulaProgram.uniforms.uPhase!, phase);
  });

  const maskCanvas = buildArtworkMaskCanvas(
    {
      title: input.title,
      artist: input.artist,
      studio: input.studio,
      album: input.album,
      year: input.year,
    },
    size,
    true,
  );
  let maskTexture: WebGLTexture | null = null;

  if (maskCanvas) {
    maskTexture = uploadCanvasTexture(gl, maskCanvas);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const sceneLoc = titleProgram.uniforms.uScene;
  const maskLoc = titleProgram.uniforms.uMask;

  if (maskTexture && sceneLoc && maskLoc) {
    drawPass(gl, titleProgram, buffer, () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTarget.texture);
      gl.uniform1i(sceneLoc, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.uniform1i(maskLoc, 1);

      gl.uniform2f(titleProgram.uniforms.uResolution!, size, size);
      gl.uniform3f(titleProgram.uniforms.uSeed!, s0, s1, s2);
      gl.uniform1f(titleProgram.uniforms.uPhase!, phase);
    });
    gl.deleteTexture(maskTexture);
  } else {
    if (maskTexture) {
      gl.deleteTexture(maskTexture);
    }
    const copySceneLoc = copyProgram.uniforms.uScene;
    drawPass(gl, copyProgram, buffer, () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTarget.texture);
      if (copySceneLoc) {
        gl.uniform1i(copySceneLoc, 0);
      }
    });
  }

  gl.deleteBuffer(buffer);
  gl.deleteFramebuffer(sceneTarget.framebuffer);
  gl.deleteTexture(sceneTarget.texture);
  gl.deleteProgram(nebulaProgram.program);
  gl.deleteProgram(titleProgram.program);
  gl.deleteProgram(copyProgram.program);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) {
    throw new Error("Failed to encode shader artwork");
  }
  return blob;
}
