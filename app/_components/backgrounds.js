/* ------------------------------------------------------------------ *
 * The backgrounds, as shaders.
 *
 * Every background in the theme picker (theme.js) is one fragment
 * shader on one full-screen quad, and they share everything but the
 * picture: the same uniforms, the same noise, the same Mist palette,
 * and the same last few lines that lighten the result towards the page
 * and dither it with grain. That shape is the 21st.dev Shader Builder's
 * — its generated components (Paper Shaders' Mesh Gradient, Grain
 * Gradient, Waves, Dot Grid) differ only in a `shade()` function and a
 * handful of numbers, and the two backgrounds this app already drew
 * (tom_ui's Animated Gradient and the metaballs) are written the same
 * way here, so one renderer can draw any of them and switch between
 * them without a second canvas.
 *
 * Paper Shaders: https://shaders.paper.design — Apache-2.0.
 *
 * WHAT EACH ONE SETS
 * ------------------
 *   speed    shader seconds per real second; all of them slow, weather
 *   scale    how much of the field the screen shows
 *   amount   how far towards the colours the page goes (the rest is the
 *            page's near-white): low, because white cards sit on it
 *   calm     how much quieter the middle of the screen is, where the
 *            reading is
 *   grain    film grain, so the gradients never band
 *   res      the drawing buffer as a fraction of the screen: these are
 *            all soft, and a soft picture does not need every pixel
 * ------------------------------------------------------------------ */

import { MIST, hexToRgb } from './theme';

export const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// The page, then the three Mist colours, light to strong.
export const PALETTE = [MIST.base, ...MIST.colors].map(hexToRgb);

const PRELUDE = `
precision highp float;
uniform vec2 u_res;       // the drawing buffer, in pixels
uniform vec2 u_css;       // the canvas, in CSS pixels
uniform float u_time;
uniform float u_energy;   // 0 at rest, 1 while an answer is being worked out
uniform vec3 u_colors[4]; // the page, then Mist light to strong
uniform vec4 u_shape;     // scale, intensity, paramA, warp
uniform vec4 u_look;      // detail, amount, calm, grain
uniform float u_seed;

#define u_base u_colors[0]
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_look.x
#define u_amount u_look.y
#define u_calm u_look.z
#define u_grain u_look.w
#define TWO_PI 6.28318530718

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Even white noise for the grain (Dave Hoskins' hash12): the hash above
// shows a faint mesh at whole-pixel coordinates.
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(15731.743, 7892.321) * n);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

// Through the four colours, page to strongest; x is clamped to 0..1.
vec3 palette(float x) {
  float f = clamp(x, 0.0, 1.0) * 3.0;
  vec3 col = u_colors[0];
  for (int i = 0; i < 3; i++) {
    col = mix(col, u_colors[i + 1], smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}
`;

const MAIN = `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  p *= u_scale;
  if (u_warp > 0.0) {
    p += u_warp * (vec2(fbm(p * u_detail + u_seed), fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  vec3 col = shade(uv, p, u_time);

  // Lighter towards the page, and lighter still through the middle where
  // the reading is. On a narrow screen the column is the whole width, so
  // the reading is everywhere and the whole field is quietened — captions
  // and links sit straight on this, not on a card, and must keep 4.5:1.
  // Busy, the colour comes up a little.
  float mid = smoothstep(0.10, 0.66, distance(uv, vec2(0.5, 0.52)));
  float narrow = 1.0 - smoothstep(700.0, 1100.0, u_css.x);
  float amt = u_amount * mix(1.0, 0.55 + 0.45 * mid, u_calm) * mix(1.0, 0.6, narrow) * (1.0 + 0.3 * u_energy);
  col = mix(u_base, col, clamp(amt, 0.0, 1.0));

  col += (grainHash(gl_FragCoord.xy + u_seed * 17.0) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* ---- the pictures --------------------------------------------------- */

// tom_ui's "Animated Gradient" (21st.dev): value noise folded over itself
// a few times, coloured from three see-through stops. This is the one
// Referrals, Ask, Contacts and Settings each drew for themselves, with
// the same stops: Mist at .12, .62 and .42 over the page.
const SWIRL = `
float rnd(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
float vnoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = rnd(i);
  float b = rnd(i + vec2(1.0, 0.0));
  float c = rnd(i + vec2(0.0, 1.0));
  float d = rnd(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 shade(vec2 uv, vec2 p, float t) {
  float tt = 0.5 * t;
  // Measured in CSS pixels, so the swirl is the same size on any screen.
  vec2 q = (uv - 0.5) * (0.0005 + 0.006 * 0.55) * u_css + 0.5;
  float n1 = vnoise(q + tt);
  float n2 = vnoise(q * 2.0 - tt);
  float angle = n1 * TWO_PI;
  q += 4.0 * 0.08 * n2 * vec2(cos(angle), sin(angle));
  for (int i = 1; i <= 5; i++) {
    float k = float(i);
    q.x += 0.62 / k * cos(tt + k * 1.5 * q.y);
    q.y += 0.62 / k * cos(tt + k * q.x);
  }
  vec2 s = q * (0.5 + 3.5 * 0.3);
  float shape = 0.5 + 0.5 * sin(s.x) * cos(s.y);
  float m = shape - 0.48 * sqrt(0.02);
  vec4 c1 = vec4(u_colors[1], 0.12);
  vec4 c2 = vec4(u_colors[2], 0.62);
  vec4 c3 = vec4(u_colors[3], 0.42);
  float r1 = smoothstep(0.0, 0.705, m);
  float r2 = smoothstep(0.3, 1.01, m);
  vec3 col = mix(mix(c1.rgb * c1.a, c2.rgb * c2.a, r1), c3.rgb * c3.a, r2);
  float a = mix(mix(c1.a, c2.a, r1), c3.a, r2);
  return u_base * (1.0 - a) + col;
}
`;

// Paper Shaders' "Mesh Gradient", from the 21st.dev Shader Builder: soft
// pools of each colour on slow orbits, weighted into one another.
const MESH = `
vec3 shade(vec2 uv, vec2 p, float t) {
  vec3 color = u_colors[0] * 0.16;
  float weight = 0.16;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 center = vec2(sin(fi * 2.17 + t * 0.13 + u_seed), cos(fi * 1.63 - t * 0.11)) * (0.22 + u_intensity * 0.62);
    float falloff = mix(12.0, 2.4, u_paramA);
    float influence = exp(-dot(p - center, p - center) * falloff);
    color += u_colors[i] * influence;
    weight += influence;
  }
  return color / weight;
}
`;

// Paper Shaders' "Grain Gradient": a slow wave through the palette, bent
// by noise, printed with a coarse grain of its own.
const GRAIN = `
vec3 shade(vec2 uv, vec2 p, float t) {
  vec2 q = p;
  q.x += sin(q.y * 2.1 + t * 0.2) * (0.08 + u_intensity * 0.32);
  q.y += cos(q.x * 2.7 - t * 0.17) * (0.06 + u_intensity * 0.26);
  float wave = 0.5 + 0.5 * sin(q.x * 2.8 + q.y * 1.9 + fbm(q * 2.0) * 3.0);
  float coarse = hash21(floor((uv + t * 0.002) * (90.0 + u_paramA * 260.0)) + u_seed);
  float grain = (coarse - 0.5) * u_paramA * 0.42;
  return palette(clamp(wave + grain, 0.0, 1.0));
}
`;

// The metaballs this app drew behind every page until now (after Paper
// Shaders' "Metaballs"): six soft balls drifting at the speed of weather.
// Busy, they lean in towards the middle of the page and swell a little.
const METABALLS = `
vec3 ball(vec2 anchor, float sx, float sy, float ph, float r, float t, float e) {
  vec2 c = anchor + vec2(sin(t * sx + ph), cos(t * sy + ph * 1.3)) * 0.16;
  c = mix(c, vec2(0.5, 0.42), e * 0.16);
  return vec3(c, r * (1.0 + 0.12 * e));
}
vec3 shade(vec2 uv, vec2 p, float t) {
  float aspect = u_res.x / u_res.y;
  vec2 q = vec2(uv.x * aspect, uv.y);
  float e = u_energy;
  vec3 b[6];
  b[0] = ball(vec2(0.08, 0.86), 0.70, 0.55, 0.0, 0.34, t, e);
  b[1] = ball(vec2(0.92, 0.92), 0.50, 0.80, 1.7, 0.38, t, e);
  b[2] = ball(vec2(0.88, 0.14), 0.62, 0.47, 3.1, 0.30, t, e);
  b[3] = ball(vec2(0.14, 0.10), 0.45, 0.66, 4.4, 0.28, t, e);
  b[4] = ball(vec2(0.52, 1.02), 0.58, 0.52, 2.2, 0.26, t, e);
  b[5] = ball(vec2(0.50, -0.04), 0.66, 0.60, 5.3, 0.24, t, e);
  float field = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 c = vec2(b[i].x * aspect, b[i].y);
    vec2 d = q - c;
    float k = (b[i].z * b[i].z) / (dot(d, d) + 0.0025);
    field += k;
    vec3 bc = (i == 0 || i == 3) ? u_colors[1] : ((i == 1 || i == 4) ? u_colors[2] : u_colors[3]);
    tint += bc * k;
  }
  tint /= max(field, 0.0001);
  float glow = smoothstep(0.15, 1.0, field);
  float body = smoothstep(0.85, 1.6, field);
  float rim = smoothstep(0.8, 1.05, field) - smoothstep(1.05, 1.5, field);
  float amt = (glow * 0.16 + body * 0.20) * 0.8;
  vec3 col = mix(u_base, tint, clamp(amt, 0.0, 0.62));
  return col + rim * 0.03;
}
`;

// Paper Shaders' "Waves": stacked sine waves across the screen, roughened
// with a little noise, read through the palette as soft bands.
const WAVES = `
vec3 shade(vec2 uv, vec2 p, float t) {
  float frequency = 2.0 + u_paramA * 14.0;
  float wave = p.y + sin(p.x * frequency + t) * (0.08 + u_intensity * 0.42);
  wave += sin((p.x + p.y) * frequency * 0.63 - t * 0.7) * u_intensity * 0.16;
  wave += (fbm(p * 2.0 + t * 0.04) - 0.5) * u_intensity * 0.28;
  return palette(0.5 + 0.5 * sin(wave * 4.0));
}
`;

// Paper Shaders' "Dot Grid": a field of dots, each nudged off the grid,
// swelling and shrinking on a slow wave that crosses the screen.
const DOTS = `
vec3 shade(vec2 uv, vec2 p, float t) {
  float cells = 8.0 + u_intensity * 25.0;
  vec2 grid = p * cells;
  vec2 id = floor(grid);
  vec2 local = fract(grid) - 0.5;
  vec2 shift = (hash22(id + u_seed) - 0.5) * u_intensity * 0.35;
  float wave = 0.5 + 0.5 * sin(id.x * 0.6 + id.y * 0.4 + t);
  float radius = mix(0.08, 0.42, u_paramA) * mix(0.55, 1.0, wave);
  float dotMask = 1.0 - smoothstep(radius * 0.75, radius, length(local - shift));
  return mix(u_colors[0], palette(wave), dotMask);
}
`;

// Aceternity's "Aurora Background" (21st.dev, manuarora700), which is CSS:
// two repeating gradients of stripes at 100 degrees, one sliding over the
// other in a difference blend, blurred, and faded out from the top-right
// corner. Drawn here as the same picture so it shares the one canvas:
// the stripes are sine bands along the same angle, the difference is
// abs(), the blur is the bands' own softness, and the corner fade is the
// same ellipse.
const AURORA = `
vec3 shade(vec2 uv, vec2 p, float t) {
  vec2 dir = vec2(0.9848, -0.1736);
  float s = dot(p, dir);
  float a1 = 0.5 + 0.5 * sin(s * 4.6 + t * 0.9 + 1.3 * sin(s * 1.6 - t * 0.35));
  float a2 = 0.5 + 0.5 * sin(s * 7.4 - t * 0.55 + 0.9 * (fbm(p * 1.1 + t * 0.04) - 0.5) * 4.0);
  float aurora = abs(a1 - a2);
  float stripes = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(s * 10.0 + t * 0.4));
  float v = mix(aurora, aurora * stripes, 0.45);
  vec2 corner = (uv - vec2(1.0, 1.0)) * vec2(0.7, 0.95);
  float fade = 1.0 - smoothstep(0.05, 1.0, length(corner));
  return mix(u_base, palette(0.35 + 0.65 * v), fade);
}
`;

/* ---- the list ------------------------------------------------------- */

// Each background's picture and numbers. Ids match THEMES in theme.js.
// Backgrounds missing from here (Still) are drawn by CSS alone.
export const SHADERS = {
  swirl: { glsl: SWIRL, speed: 0.11, scale: 1, amount: 1, calm: 0, grain: 0.012, res: 0.5 },
  mesh: { glsl: MESH, speed: 0.32, scale: 1.1, intensity: 0.5, paramA: 0.42, amount: 0.8, calm: 0.5, grain: 0.02, res: 0.4 },
  grain: { glsl: GRAIN, speed: 0.22, scale: 1.1, intensity: 0.35, paramA: 0.28, amount: 0.42, calm: 0.55, grain: 0.03, res: 0.5 },
  waves: { glsl: WAVES, speed: 0.2, scale: 1.26, intensity: 0.3, paramA: 0.12, amount: 0.4, calm: 0.55, grain: 0.02, res: 0.5 },
  aurora: { glsl: AURORA, speed: 0.12, scale: 1.1, amount: 0.8, calm: 0.6, grain: 0.02, res: 0.4 },
  metaballs: { glsl: METABALLS, speed: 0.09, scale: 1, amount: 1, calm: 0, grain: 0.016, res: 0.34 },
  dots: { glsl: DOTS, speed: 0.35, scale: 1.26, intensity: 0.35, paramA: 0.2, amount: 0.42, calm: 0.7, grain: 0, res: 0.5 },
};

export const fragFor = (id) => (SHADERS[id] ? PRELUDE + SHADERS[id].glsl + MAIN : null);

/* ---- drawing them ----------------------------------------------------- */

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== 'production') console.warn('[background]', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// One quad, shared by every programme on a context.
export function quad(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return buf;
}

// Builds one background's programme and sets everything that does not
// change from frame to frame. Returns what the frame loop needs, or null
// if the GPU refused it.
export function program(gl, id) {
  const def = SHADERS[id];
  const src = fragFor(id);
  if (!def || !src) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, src);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.deleteProgram(prog); return null; }
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_colors'), new Float32Array(PALETTE.flat()));
  gl.uniform4f(gl.getUniformLocation(prog, 'u_shape'), def.scale ?? 1, def.intensity ?? 0.35, def.paramA ?? 0.28, def.warp ?? 0);
  gl.uniform4f(gl.getUniformLocation(prog, 'u_look'), def.detail ?? 1.8, def.amount ?? 1, def.calm ?? 0, def.grain ?? 0.016);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_seed'), def.seed ?? 1);
  return {
    id,
    def,
    prog,
    aPos,
    uRes: gl.getUniformLocation(prog, 'u_res'),
    uCss: gl.getUniformLocation(prog, 'u_css'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
    uEnergy: gl.getUniformLocation(prog, 'u_energy'),
  };
}

// Draws one frame of a built programme.
export function frame(gl, p, { w, h, cssW, cssH, time, energy }) {
  gl.useProgram(p.prog);
  gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(p.uRes, w, h);
  gl.uniform2f(p.uCss, cssW, cssH);
  gl.uniform1f(p.uTime, time);
  gl.uniform1f(p.uEnergy, energy);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/* ---- the picker's thumbnails ------------------------------------------- */

// One still of each background, drawn once on a throwaway canvas the
// first time the picker opens and kept for the rest of the visit. The
// thumbnails are the real shaders, not drawings of them, so what is
// chosen is what arrives. Drawn as if onto a laptop screen, so the
// pattern is at the size it will be on the page, only smaller.
let stills = null;
export function backgroundStills(width = 168, height = 104) {
  if (stills) return stills;
  if (typeof document === 'undefined') return {};
  const out = {};
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!gl) { stills = out; return out; }
  gl.viewport(0, 0, width, height);
  quad(gl);
  for (const id of Object.keys(SHADERS)) {
    const p = program(gl, id);
    if (!p) continue;
    frame(gl, p, { w: width, h: height, cssW: 1440, cssH: 900, time: 9 + id.length * 3.7, energy: 0 });
    try { out[id] = canvas.toDataURL('image/png'); } catch (e) {}
    gl.deleteProgram(p.prog);
  }
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  stills = out;
  return out;
}
