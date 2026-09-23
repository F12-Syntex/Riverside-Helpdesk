'use client';

import React from 'react';
import { themeById, readTheme, hexToRgb } from './theme';

/* ------------------------------------------------------------------ *
 * ShaderBackground — the light behind every page.
 *
 * One WebGL fragment shader, no dependencies, fixed behind the whole
 * shell: six soft METABALLS in the theme's three colours (see theme.js),
 * drifting at the speed of weather and melting into one another where
 * they meet — the shape of the paper-design "metaballs background". A
 * faint grain dithers the gradients so they never band.
 *
 * IT SAYS WHEN THE ASSISTANT IS WORKING. While an answer is being worked
 * out (<html data-busy>, set by WorkingState) the balls quicken, gather a
 * little towards the middle of the page and brighten, and settle back
 * when the answer lands. The page itself is the progress, not only the
 * card in it. The change is eased, never switched.
 *
 * WHAT IT DOES WHEN IT CANNOT
 * ---------------------------
 * No WebGL, a reduced-motion setting, or a lost context: the element
 * keeps a CSS gradient of the same palette (.riva-sky in globals.css,
 * themed there) and simply does not move.
 *
 * A LOST CONTEXT COMES BACK
 * -------------------------
 * The loss is not treated as final (preventDefault), the programme is
 * rebuilt on restore, and the cleanup does NOT lose the context on
 * purpose: the next run of this effect gets the same canvas element and
 * would be handed the same, dead, context back.
 *
 * COST
 * ----
 * One quad at a third of the screen's resolution, thirty frames a
 * second, paused whenever the tab is hidden.
 * ------------------------------------------------------------------ */

const BASE = [0.973, 0.980, 0.988]; // #f8fafc — the page, near white

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform float u_int;
uniform vec3 u_base;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// One ball: where it sits, how it wanders, and how big it is.
vec3 ball(vec2 anchor, float sx, float sy, float ph, float r, float t, float e) {
  vec2 c = anchor + vec2(sin(t * sx + ph), cos(t * sy + ph * 1.3)) * 0.16;
  // Busy: every ball leans towards the middle of the page.
  c = mix(c, vec2(0.5, 0.42), e * 0.16);
  return vec3(c, r * (1.0 + 0.12 * e));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time;
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
    vec2 d = p - c;
    float k = (b[i].z * b[i].z) / (dot(d, d) + 0.0025);
    field += k;
    vec3 bc = (i == 0 || i == 3) ? u_c1 : ((i == 1 || i == 4) ? u_c2 : u_c3);
    tint += bc * k;
  }
  tint /= max(field, 0.0001);

  // The metaball: a soft glow everywhere the field reaches, a firmer body
  // where it crosses the threshold, and a thin lighter rim on that edge.
  float glow = smoothstep(0.15, 1.0, field);
  float body = smoothstep(0.85, 1.6, field);
  float rim = smoothstep(0.8, 1.05, field) - smoothstep(1.05, 1.5, field);

  // Quieter through the middle, where the reading is.
  float mid = smoothstep(0.12, 0.62, distance(uv, vec2(0.5, 0.52)));
  float amt = (glow * 0.16 + body * 0.20) * (0.55 + 0.45 * mid) * u_int * (1.0 + 0.55 * e);

  vec3 col = mix(u_base, tint, clamp(amt, 0.0, 0.62));
  col += rim * 0.035 * (0.6 + 0.4 * e);

  // Grain, so the gradients never band.
  float g = hash(gl_FragCoord.xy + fract(u_time * 7.0)) - 0.5;
  col += g * 0.016;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Builds the programme on a (fresh or restored) context. Returns the
// uniform locations the frame loop needs, or null if the GPU refused.
function build(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.uniform3fv(gl.getUniformLocation(prog, 'u_base'), BASE);
  return {
    uRes: gl.getUniformLocation(prog, 'u_res'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
    uEnergy: gl.getUniformLocation(prog, 'u_energy'),
    uInt: gl.getUniformLocation(prog, 'u_int'),
    uC1: gl.getUniformLocation(prog, 'u_c1'),
    uC2: gl.getUniformLocation(prog, 'u_c2'),
    uC3: gl.getUniformLocation(prog, 'u_c3'),
  };
}

function setTheme(gl, u, id) {
  const theme = themeById(id);
  gl.uniform3fv(u.uC1, hexToRgb(theme.colors[0]));
  gl.uniform3fv(u.uC2, hexToRgb(theme.colors[1]));
  gl.uniform3fv(u.uC3, hexToRgb(theme.colors[2]));
  gl.uniform1f(u.uInt, theme.intensity);
}

export default function ShaderBackground() {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return undefined;
    if (!gl.isContextLost()) canvas.__rivaLose = gl.getExtension('WEBGL_lose_context');

    let alive = true;
    let raf = 0;
    let last = 0;
    let u = null;
    // The balls' clock runs at a speed that eases with the energy, so a
    // change of pace never jumps them to a new place.
    let phase = 0;
    let energy = 0;
    let prev = performance.now();

    function size() {
      const scale = Math.min(0.34, 640 / Math.max(1, canvas.clientWidth));
      const w = Math.max(160, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(90, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(u.uRes, w, h);
    }

    function draw() {
      if (!u || gl.isContextLost()) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const target = document.documentElement.dataset.busy ? 1 : 0;
      energy += (target - energy) * Math.min(1, dt * 1.6);
      phase += dt * (0.09 + 0.22 * energy);
      size();
      gl.uniform1f(u.uTime, phase);
      gl.uniform1f(u.uEnergy, energy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw();
    }

    function run() {
      cancelAnimationFrame(raf);
      raf = 0;
      prev = performance.now();
      if (!reduced && !document.hidden) raf = requestAnimationFrame(loop);
    }

    function begin() {
      u = build(gl);
      if (!u) return false;
      setTheme(gl, u, readTheme());
      draw();
      canvas.style.opacity = '1';
      run();
      return true;
    }

    function onLost(e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      u = null;
      canvas.style.opacity = '0';
    }
    function onRestored() { begin(); }
    function visibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (u) run();
    }
    function onTheme(e) {
      if (!u) return;
      setTheme(gl, u, e.detail);
      if (reduced) draw();
    }

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    window.addEventListener('resize', draw);
    window.addEventListener('riva-theme', onTheme);
    document.addEventListener('visibilitychange', visibility);

    if (gl.isContextLost()) {
      if (canvas.__rivaLose) canvas.__rivaLose.restoreContext();
    } else {
      begin();
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      window.removeEventListener('resize', draw);
      window.removeEventListener('riva-theme', onTheme);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return (
    <div aria-hidden="true" className="riva-sky">
      <canvas ref={ref} className="riva-sky-canvas" />
      {/* A dot grid over the light, fading out towards the middle: the
          dithered texture of the "neon dither", kept to a whisper. */}
      <div className="riva-sky-dots" />
    </div>
  );
}
