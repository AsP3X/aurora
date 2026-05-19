// Human: WebGL background — aurora, meteors, horizon, silhouettes, bloom, auth focus scrim.
// Agent: MULTI-PASS FBO; aurora→blur→bloom→composite; DISPOSE on unmount; meteors from MeteorField.

import { MAX_METEORS, SURFACE_CEILING, type GlMeteorSlot } from "./meteors";

export interface GlFocusRect {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  active: boolean;
}

export interface GlFrameInput {
  time: number;
  focus: GlFocusRect;
  authMode: boolean;
  meteors: GlMeteorSlot[];
  meteorCount: number;
}

const AURORA_VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Human: Aurora sky, mineral meteors, horizon glow, parallax hills; motion kept slow for comfort.
// Agent: FRAG full-screen; UNIFORMS uTime uMeteors[]; FBM; ridge masks; OUTPUT opaque RGB.
const AURORA_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform int uMeteorCount;
uniform float uSurfaceCeiling;
uniform vec4 uMeteorKinematics[8];
uniform vec4 uMeteorProps[8];
uniform float uMeteorPhase[8];

const float HORIZON_Y = 0.21;
const float PLANET_CENTER_X = 0.5;
const float PLANET_CENTER_Y = -0.42;

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

// Human: Three-octave FBM for secondary layers — cheaper than full fbm when we stack several samples.
// Agent: PURE; 3 noise octaves; RETURNS 0..1 scalar.
float fbmLite(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

// Human: Slowly rotate UV around center so flow direction changes over time instead of a fixed diagonal pan.
// Agent: PURE; READS uv center angle; RETURNS warped 0..1 uv.
vec2 rotateUv(vec2 uv, float angle) {
  vec2 c = uv - 0.5;
  float cs = cos(angle);
  float sn = sin(angle);
  return vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
}

// Human: Procedural ridgeline — sine stack plus noise for organic hill silhouettes.
// Agent: PURE; READS x base amp phase; RETURNS skyline height 0..1.
float ridgeHeight(float x, float base, float amp, float phase) {
  float xw = x * 5.8 + phase;
  return base
    + amp * (0.44 * sin(xw * 1.0 + 1.2) + 0.3 * sin(xw * 2.2 + 2.1) + 0.18 * sin(xw * 4.5 + 0.6))
    + amp * 0.14 * (fbmLite(vec2(x * 3.2, 2.8)) - 0.5);
}

// Human: 1 below the ridge line, 0 above — used to paint parallax hill layers.
// Agent: PURE; READS uv parallax base amp; RETURNS land mask.
float silhouetteMask(vec2 uv, float parallax, float base, float amp) {
  float ridge = ridgeHeight(uv.x + parallax, base, amp, parallax * 2.4);
  return 1.0 - smoothstep(ridge - 0.01, ridge + 0.02, uv.y);
}

// Human: Static planet limb and horizon band — no time drift so the surface stays fixed.
// Agent: PURE; READS uv only; CONST HORIZON_Y; RETURNS scalar glow intensity.
float horizonPlanetGlow(vec2 uv) {
  float horizonY = HORIZON_Y + sin(uv.x * 9.0) * 0.004;
  float aboveHorizon = uv.y - horizonY;
  float arcBand = exp(-aboveHorizon * aboveHorizon / 0.0016) * smoothstep(-0.02, 0.2, uv.y);
  float upperHaze = smoothstep(0.14, 0.0, aboveHorizon) * smoothstep(-0.03, 0.05, aboveHorizon);

  vec2 planetCenter = vec2(PLANET_CENTER_X, PLANET_CENTER_Y);
  vec2 pd = (uv - planetCenter) * vec2(1.0, 0.9);
  float limb = smoothstep(0.78, 0.62, length(pd)) * smoothstep(0.5, 0.58, length(pd));

  return arcBand * 0.55 + upperHaze * 0.35 + limb * 0.28;
}

// Human: Meteor emission colors by mineral — Na yellow, Fe orange, Mg blue-white, Ca violet, Si gold.
// Agent: PURE; mineral index 0..4; RETURNS rgb head/tail/ember triplet helpers.
vec3 meteorHeadColor(float mineral) {
  if (mineral < 0.5) return vec3(1.0, 0.96, 0.58);
  if (mineral < 1.5) return vec3(1.0, 0.86, 0.42);
  if (mineral < 2.5) return vec3(0.82, 0.94, 1.0);
  if (mineral < 3.5) return vec3(1.0, 0.72, 0.82);
  return vec3(1.0, 0.9, 0.62);
}

vec3 meteorTailColor(float mineral) {
  if (mineral < 0.5) return vec3(1.0, 0.84, 0.32);
  if (mineral < 1.5) return vec3(0.95, 0.52, 0.12);
  if (mineral < 2.5) return vec3(0.48, 0.72, 0.95);
  if (mineral < 3.5) return vec3(0.88, 0.38, 0.52);
  return vec3(0.96, 0.72, 0.28);
}

vec3 meteorEmberColor(float mineral) {
  if (mineral < 0.5) return vec3(1.0, 0.62, 0.15);
  if (mineral < 1.5) return vec3(0.82, 0.32, 0.06);
  if (mineral < 2.5) return vec3(0.35, 0.58, 0.88);
  if (mineral < 3.5) return vec3(0.68, 0.22, 0.42);
  return vec3(0.88, 0.48, 0.1);
}

// Human: Distance to a line segment — core of streak geometry.
// Agent: PURE; READS uv segment ab; RETURNS along 0..1 and perpendicular distance.
vec3 segmentClosest(vec2 uv, vec2 a, vec2 b) {
  vec2 pa = uv - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 0.000001);
  float along = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  vec2 closest = a + ba * along;
  return vec3(along, length(uv - closest), 0.0);
}

// Human: Burn envelope — ramp bright through sin peak, then alpha falls off (flare then fade).
// Agent: PURE; READS burn01 0..1; RETURNS multiplier boost and fade factor.
vec2 burnEnvelope(float burn01) {
  if (burn01 < 0.001) return vec2(1.0, 1.0);
  float flare = sin(clamp(burn01, 0.0, 1.0) * 3.14159265);
  float ramp = smoothstep(0.0, 0.38, burn01);
  float boost = 1.0 + flare * 3.2 * ramp;
  float fade = 1.0 - smoothstep(0.5, 1.0, burn01) * 0.94;
  return vec2(boost, fade);
}

// Human: Realistic meteor — flare/fade burn-up, optional fragment scale, sparks and ion halo.
// Agent: READS kin+props; burn01 in props.w; uSurfaceCeiling; RETURNS additive rgb.
vec3 renderMeteor(vec2 uv, vec4 kin, vec4 props, float phase) {
  vec2 head = kin.xy;
  vec2 vel = kin.zw;
  float tailLen = props.x;
  float mineral = props.y;
  float life = props.z;
  float burn01 = props.w;

  if (life < 0.02 || length(vel) < 0.0001) return vec3(0.0);

  vec2 dir = normalize(vel);
  vec2 tail = head - dir * tailLen;
  vec3 seg = segmentClosest(uv, tail, head);
  float along = seg.x;
  float perp = seg.y;

  float skyGate = smoothstep(uSurfaceCeiling - 0.02, uSurfaceCeiling + 0.14, uv.y);
  float trailY = mix(tail.y, head.y, along);
  float ablate = smoothstep(uSurfaceCeiling - 0.04, uSurfaceCeiling + 0.1, trailY);
  float lifeFade = smoothstep(0.0, 0.12, life) * pow(life, 0.55);

  vec2 burn = burnEnvelope(burn01);
  float burnBoost = burn.x;
  float burnFade = burn.y;
  float fragWt = step(tailLen, 0.16) * step(0.42, burn01);

  float taperMax = mix(0.009, 0.006, fragWt);
  float taper = mix(0.001, taperMax, pow(along, 0.72));
  float streakTight = smoothstep(taper, 0.0, perp);
  float streakWide = smoothstep(taper * 3.6, 0.0, perp) * mix(0.48, 0.35, fragWt);

  float lum = exp(-(1.0 - along) * mix(5.8, 4.2, fragWt));
  float tailEnvelope = smoothstep(0.0, 0.06, along) * smoothstep(1.0, 0.68, along);

  vec2 headDelta = uv - head;
  float headDist2 = dot(headDelta, headDelta);
  float nucleus = exp(-headDist2 / mix(0.000035, 0.00005, fragWt));
  float corona = exp(-headDist2 / 0.00026) * (0.5 + burn01 * 0.65);
  float ionRing = exp(-headDist2 / 0.00085) * 0.22;

  vec3 headCol = meteorHeadColor(mineral);
  vec3 tailCol = meteorTailColor(mineral);
  vec3 emberCol = meteorEmberColor(mineral);
  vec3 ionGreen = vec3(0.62, 0.95, 0.78);

  float sparkSum = 0.0;
  for (int s = 0; s < 5; s++) {
    if (fragWt > 0.5 && s > 2) continue;
    float fi = float(s);
    float seed = hash(vec2(phase + fi * 3.7, floor(along * 28.0 + fi)));
    if (seed < mix(0.78, 0.7, fragWt)) continue;
    float sparkAlong = fract(seed * 13.1 + fi * 0.17);
    vec2 sparkPos = mix(tail, head, sparkAlong);
    float sparkD2 = dot(uv - sparkPos, uv - sparkPos);
    sparkSum += exp(-sparkD2 / 0.00002) * (0.35 + seed * 0.65);
  }

  float trainNoise = fbmLite(vec2(along * 32.0 + phase, perp * 140.0 + phase * 0.3));
  float debrisWisp = trainNoise * streakTight * smoothstep(1.0, 0.12, along) * (0.3 + burn01 * 0.45);

  float ablationBloom = 0.0;
  if (burn01 > 0.2) {
    float bloomAlong = exp(-(1.0 - along) * 2.8) * streakWide;
    ablationBloom = bloomAlong * sin(burn01 * 3.14159265) * 1.1;
  }

  vec3 streak = mix(tailCol, headCol, pow(along, 0.42)) * lum * (streakTight + streakWide);
  streak += emberCol * debrisWisp;
  streak += vec3(1.0, 0.98, 0.94) * nucleus * (1.5 + burn01 * 1.2);
  streak += mix(headCol, vec3(1.0), 0.65) * corona;
  streak += ionGreen * ionRing * (0.4 + 0.3 * step(1.5, mineral));
  streak += vec3(1.0, 0.92, 0.72) * sparkSum * tailEnvelope;
  streak += vec3(1.0, 0.88, 0.62) * ablationBloom;
  streak *= burnBoost;

  float alpha = (streakTight * lum + streakWide * 0.6 + nucleus + corona * 0.5);
  alpha *= tailEnvelope * skyGate * ablate * lifeFade * burnFade;

  return streak * alpha;
}

// Human: Additive blend of active meteors into the sky layer.
// Agent: LOOP i<8; READS uniforms+uMeteorPhase; ACCUM rgb.
vec3 addMeteors(vec2 uv) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uMeteorCount) continue;
    sum += renderMeteor(uv, uMeteorKinematics[i], uMeteorProps[i], uMeteorPhase[i]);
  }
  return sum;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 base = vec3(0.059, 0.055, 0.078);

  float t = uTime;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uvAspect = vec2((uv.x - 0.5) * aspect + 0.5, uv.y);

  float orbit = t * 0.038;
  vec2 flowA = vec2(cos(orbit * 0.9), sin(orbit * 1.1)) * t * 0.032;
  vec2 flowB = vec2(sin(orbit * 1.35 + 1.7), cos(orbit * 0.75 + 0.4)) * t * 0.026;

  vec2 rotUv = rotateUv(uvAspect, sin(t * 0.016) * 0.1);

  vec2 warpSeed = rotUv * vec2(1.9, 2.6) + vec2(t * 0.014, -t * 0.011);
  vec2 warp = vec2(
    fbmLite(warpSeed + 2.4),
    fbmLite(warpSeed + 8.1)
  ) - 0.5;
  warp *= 0.28;

  float curtainWave = sin(uv.y * 11.0 + t * 0.2 + sin(uv.x * 5.0 + t * 0.12) * 1.6) * 0.07;
  vec2 curtainUv = rotUv * vec2(1.55, 2.35) + warp + flowA;
  curtainUv.x += curtainWave;
  curtainUv.y += sin(uv.x * 7.0 - t * 0.16) * 0.035;
  float curtain = fbm(curtainUv);

  vec2 driftUv = rotateUv(uvAspect, -t * 0.022) * vec2(2.1, 1.65) - flowB + warp * 0.65;
  driftUv += vec2(sin(t * 0.1 + uv.y * 4.0), cos(t * 0.08 + uv.x * 3.0)) * 0.08;
  float drift = fbmLite(driftUv + vec2(fbmLite(rotUv * 3.0 + t * 0.018), 0.0));

  vec2 wispUv = uvAspect + vec2(
    sin(t * 0.07 + uv.y * 6.5) * 0.1,
    cos(t * 0.06 + uv.x * 5.0) * 0.08
  );
  float wisps = fbmLite(wispUv * 3.8 + flowA * 0.6 + vec2(0.0, t * 0.028));

  float mixField = curtain * 0.52 + drift * 0.33 + wisps * 0.22;
  float band = smoothstep(0.34, 0.84, mixField);

  vec3 violet = vec3(0.545, 0.361, 0.965);
  vec3 deep = vec3(0.424, 0.157, 0.851);
  vec3 rose = vec3(0.62, 0.38, 0.92);
  float colorShift = 0.5 + 0.5 * sin(t * 0.09 + uv.x * 5.5 + uv.y * 3.2 + fbmLite(rotUv * 2.0) * 2.5);
  vec3 tint = mix(mix(deep, violet, colorShift), rose, band * 0.35);
  float heightGlow = smoothstep(0.05, 0.75, uv.y) * (0.65 + 0.35 * sin(t * 0.11 + uv.x * 8.0));
  vec3 aurora = tint * band * (0.2 + heightGlow * 0.12);

  float breathe = 0.5 + 0.5 * sin(t * 0.14 + fbmLite(rotUv * 1.4 + t * 0.025) * 6.28);
  float shimmer = sin(t * 0.18 + uv.y * 14.0 + mixField * 8.0) * smoothstep(0.12, 0.92, uv.y);
  aurora += violet * shimmer * 0.016 * breathe;

  vec3 sky = base + aurora;

  vec3 horizonTint = mix(vec3(0.48, 0.3, 0.88), vec3(0.72, 0.58, 0.98), 0.62);
  float horizon = horizonPlanetGlow(uv);
  sky += horizonTint * horizon * 0.32;

  sky += addMeteors(uv);

  float maskFar = silhouetteMask(uv, 0.0, 0.2, 0.055);
  float maskMid = silhouetteMask(uv, 0.4, 0.14, 0.085);
  float maskNear = silhouetteMask(uv, 0.85, 0.09, 0.11);

  vec3 colFar = vec3(0.048, 0.044, 0.062);
  vec3 colMid = vec3(0.034, 0.031, 0.045);
  vec3 colNear = vec3(0.022, 0.02, 0.032);

  vec3 rgb = mix(sky, colFar, maskFar * 0.88);
  rgb = mix(rgb, colMid, maskMid * 0.92);
  rgb = mix(rgb, colNear, maskNear * 0.96);

  vec2 centered = (uv - 0.5) * vec2(1.0, 0.85);
  float vignette = 1.0 - dot(centered, centered) * 0.85;

  float grain = (hash(uv * uResolution + t) - 0.5) * 0.018;
  rgb = rgb * vignette + grain;

  gl_FragColor = vec4(rgb, 1.0);
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

// Human: Pull bright aurora pixels into a bloom buffer for a soft halo in the composite pass.
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

// Human: Merge blurred aurora + bloom and apply auth focus scrim with light film grain.
// Agent: FRAG samples scene+bloom; UNIFORMS focus uTime uResolution; OUTPUT final RGB.
const COMPOSITE_FRAG = `
precision highp float;
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

type GlContext = WebGLRenderingContext | WebGL2RenderingContext;

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
    "uTime",
    "uResolution",
    "uMeteorCount",
    "uSurfaceCeiling",
    "uMeteorKinematics[0]",
    "uMeteorProps[0]",
    "uMeteorPhase[0]",
    "uTexture",
    "uBloomTexture",
    "uTexelSize",
    "uDirection",
    "uFocusCenter",
    "uFocusRadius",
    "uFocusActive",
    "uBloomStrength",
  ];
  const attribNames = ["aPosition"];

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
  private readonly blurProgram: GlProgram;
  private readonly bloomExtractProgram: GlProgram;
  private readonly compositeProgram: GlProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly meteorKinematicsLoc: WebGLUniformLocation | null;
  private readonly meteorPropsLoc: WebGLUniformLocation | null;
  private readonly meteorPhaseLoc: WebGLUniformLocation | null;
  private sceneTarget: FramebufferTarget;
  private blurTarget: FramebufferTarget;
  private bloomTarget: FramebufferTarget;
  private width = 0;
  private height = 0;

  private constructor(
    gl: GlContext,
    auroraProgram: GlProgram,
    blurProgram: GlProgram,
    bloomExtractProgram: GlProgram,
    compositeProgram: GlProgram,
    quadBuffer: WebGLBuffer,
    meteorKinematicsLoc: WebGLUniformLocation | null,
    meteorPropsLoc: WebGLUniformLocation | null,
    meteorPhaseLoc: WebGLUniformLocation | null,
    sceneTarget: FramebufferTarget,
    blurTarget: FramebufferTarget,
    bloomTarget: FramebufferTarget,
  ) {
    this.gl = gl;
    this.auroraProgram = auroraProgram;
    this.blurProgram = blurProgram;
    this.bloomExtractProgram = bloomExtractProgram;
    this.compositeProgram = compositeProgram;
    this.quadBuffer = quadBuffer;
    this.meteorKinematicsLoc = meteorKinematicsLoc;
    this.meteorPropsLoc = meteorPropsLoc;
    this.meteorPhaseLoc = meteorPhaseLoc;
    this.sceneTarget = sceneTarget;
    this.blurTarget = blurTarget;
    this.bloomTarget = bloomTarget;
  }

  // Human: Factory tries WebGL first; returns null when shaders or FBO setup fail so caller can fall back to CSS.
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
    const blurProgram = createProgram(gl, BLUR_VERT, BLUR_FRAG);
    const bloomExtractProgram = createProgram(gl, BLUR_VERT, BLOOM_EXTRACT_FRAG);
    const compositeProgram = createProgram(gl, BLUR_VERT, COMPOSITE_FRAG);
    if (!auroraProgram || !blurProgram || !bloomExtractProgram || !compositeProgram) {
      return null;
    }

    const quadBuffer = gl.createBuffer();
    if (!quadBuffer) return null;

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITIONS, gl.STATIC_DRAW);

    const sceneTarget = createFramebuffer(gl, 4, 4);
    const blurTarget = createFramebuffer(gl, 4, 4);
    const bloomTarget = createFramebuffer(gl, 4, 4);
    if (!sceneTarget || !blurTarget || !bloomTarget) return null;

    const meteorKinematicsLoc = gl.getUniformLocation(auroraProgram.program, "uMeteorKinematics[0]");
    const meteorPropsLoc = gl.getUniformLocation(auroraProgram.program, "uMeteorProps[0]");
    const meteorPhaseLoc = gl.getUniformLocation(auroraProgram.program, "uMeteorPhase[0]");

    return new NetworkBackgroundGlRenderer(
      gl,
      auroraProgram,
      blurProgram,
      bloomExtractProgram,
      compositeProgram,
      quadBuffer,
      meteorKinematicsLoc,
      meteorPropsLoc,
      meteorPhaseLoc,
      sceneTarget,
      blurTarget,
      bloomTarget,
    );
  }

  // Human: Pack CPU meteor slots into vec4 arrays for the aurora fragment shader.
  // Agent: WRITES uniform4fv uMeteorKinematics+uMeteorProps; SETS uMeteorCount.
  private uploadMeteorUniforms(meteors: GlMeteorSlot[], meteorCount: number) {
    const gl = this.gl;
    bindProgram(gl, this.auroraProgram);
    gl.uniform1i(this.auroraProgram.uniforms.uMeteorCount!, meteorCount);
    gl.uniform1f(this.auroraProgram.uniforms.uSurfaceCeiling!, SURFACE_CEILING);

    const kinematics = new Float32Array(MAX_METEORS * 4);
    const props = new Float32Array(MAX_METEORS * 4);
    const phases = new Float32Array(MAX_METEORS);

    for (let i = 0; i < MAX_METEORS; i++) {
      const meteor = meteors[i];
      const offset = i * 4;
      kinematics[offset] = meteor.headX;
      kinematics[offset + 1] = meteor.headY;
      kinematics[offset + 2] = meteor.velX;
      kinematics[offset + 3] = meteor.velY;
      props[offset] = meteor.tailLength;
      props[offset + 1] = meteor.mineral;
      props[offset + 2] = meteor.life01;
      props[offset + 3] = meteor.burn01;
      phases[i] = meteor.phase;
    }

    if (this.meteorKinematicsLoc) {
      gl.uniform4fv(this.meteorKinematicsLoc, kinematics);
    }
    if (this.meteorPropsLoc) {
      gl.uniform4fv(this.meteorPropsLoc, props);
    }
    if (this.meteorPhaseLoc) {
      gl.uniform1fv(this.meteorPhaseLoc, phases);
    }
  }

  // Human: Match canvas backing store to container CSS size and rebuild FBO textures when dimensions change.
  // Agent: SETS canvas.width/height; RESIZES scene+blur+bloom FBOs.
  resize(cssWidth: number, cssHeight: number) {
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

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

  // Human: Aurora → blur → bloom → composite with optional auth focus mask.
  // Agent: sceneTarget=aurora; ping-pong blur; bloom extract+blur; composite to default framebuffer.
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
    this.uploadMeteorUniforms(frame.meteors, frame.meteorCount);
    this.drawQuad(this.auroraProgram);

    this.runBloomPipeline();
    this.runBlurBetween(this.sceneTarget, this.blurTarget, auroraBlurStrength, 1, 0);
    this.runBlurBetween(this.blurTarget, this.sceneTarget, auroraBlurStrength, 0, 1);

    this.runCompositePass(frame, resolution);
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

  // Human: Merge blurred aurora and bloom, apply auth focus scrim to the screen.
  // Agent: DRAW compositeProgram; SAMPLING sceneTarget + bloomTarget; SETS focus uniforms.
  private runCompositePass(frame: GlFrameInput, resolution: [number, number]) {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

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

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.auroraProgram.program);
    gl.deleteProgram(this.blurProgram.program);
    gl.deleteProgram(this.bloomExtractProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteFramebuffer(this.sceneTarget.framebuffer);
    gl.deleteTexture(this.sceneTarget.texture);
    gl.deleteFramebuffer(this.blurTarget.framebuffer);
    gl.deleteTexture(this.blurTarget.texture);
    gl.deleteFramebuffer(this.bloomTarget.framebuffer);
    gl.deleteTexture(this.bloomTarget.texture);
  }
}
