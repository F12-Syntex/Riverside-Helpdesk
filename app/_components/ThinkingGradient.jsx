'use client';

import React from 'react';
import { themeById, readTheme, hexToRgb } from './theme';

/* ------------------------------------------------------------------ *
 * ThinkingGradient — a soft swirl of colour over the page while an
 * answer is worked out.
 *
 * The 21st.dev "Animated gradient" (tom_ui): a field of noise folded
 * over itself a few times (the swirl), coloured from three stops. Here
 * the stops are the theme's three colours, two of them see-through, so
 * what shows is a faint wash of the theme slowly turning over the light
 * rather than a gradient filling the page.
 *
 * It is meant to be noticed only out of the corner of the eye: slow,
 * pale, and masked almost clear through the middle of the page where
 * the reading is, and never under the top bar (.riva-glow in
 * globals.css). It fades in when <html data-busy> is set (the working
 * card sets it, see chat/WorkingState.jsx) and out as the answer lands.
 *
 * COST
 * ----
 * One quad at about half the screen's resolution, thirty frames a
 * second, and only while it is showing: the loop starts when the page
 * goes busy and stops once the fade out has finished, or the tab is
 * hidden. No WebGL, or a lost context: nothing is drawn and the page
 * carries on without it. Reduced motion: one still frame fades in.
 * ------------------------------------------------------------------ */

// The swirl, after the component's own parameters (its "Plasma"-like
// settings, slowed down). Speed is in shader time per second.
const SPEED = 0.22;
const SCALE = 0.55;
const DISTORTION = 0.08;
const SWIRL = 0.62;
const ITERATIONS = 5;
const SHAPE_SIZE = 0.3;
const PROPORTION = 0.48;
const FADE_MS = 2000; // keep drawing this long after the page stops being busy

// How much of each theme colour shows, light to strong.
const ALPHA = [0.0, 0.85, 0.45];

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_pixelRatio;
uniform vec4 u_c1;
uniform vec4 u_c2;
uniform vec4 u_c3;

#define TWO_PI 6.28318530718

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Three stops, blended with soft edges. Out premultiplied, as the
// canvas expects.
vec4 blend(vec4 c1, vec4 c2, vec4 c3, float m) {
  float r1 = smoothstep(0.0, 0.7 + 0.005, m);
  float r2 = smoothstep(0.3, 1.0 + 0.01, m);
  vec3 col = mix(mix(c1.rgb * c1.a, c2.rgb * c2.a, r1), c3.rgb * c3.a, r2);
  float a = mix(mix(c1.a, c2.a, r1), c3.a, r2);
  return vec4(col, a);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = 0.5 * u_time;
  float noiseScale = 0.0005 + 0.006 * ${SCALE.toFixed(3)};

  uv -= 0.5;
  uv *= noiseScale * u_res;
  uv /= u_pixelRatio;
  uv += 0.5;

  float n1 = noise(uv + t);
  float n2 = noise(uv * 2.0 - t);
  float angle = n1 * TWO_PI;
  uv += 4.0 * ${DISTORTION.toFixed(3)} * n2 * vec2(cos(angle), sin(angle));

  for (int i = 1; i <= ${ITERATIONS}; i++) {
    float k = float(i);
    uv.x += ${SWIRL.toFixed(3)} / k * cos(t + k * 1.5 * uv.y);
    uv.y += ${SWIRL.toFixed(3)} / k * cos(t + k * uv.x);
  }

  vec2 s = uv * (0.5 + 3.5 * ${SHAPE_SIZE.toFixed(3)});
  float shape = 0.5 + 0.5 * sin(s.x) * cos(s.y);
  float p = ${PROPORTION.toFixed(3)} - 0.5;
  float mixer = shape + 0.48 * sign(p) * pow(abs(p), 0.5);

  gl_FragColor = blend(u_c1, u_c2, u_c3, mixer);
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

  return {
    uRes: gl.getUniformLocation(prog, 'u_res'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
    uPixelRatio: gl.getUniformLocation(prog, 'u_pixelRatio'),
    uC: [1, 2, 3].map((n) => gl.getUniformLocation(prog, 'u_c' + n)),
  };
}

function setTheme(gl, u, id) {
  const theme = themeById(id);
  theme.colors.forEach((hex, i) => gl.uniform4fv(u.uC[i], [...hexToRgb(hex), ALPHA[i]]));
}

export default function ThinkingGradient() {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const root = document.documentElement;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    if (!gl) return undefined;

    let alive = true;
    let raf = 0;
    let last = 0;
    let u = null;
    // The clock only runs while the swirl is on screen, so it picks up
    // where it left off rather than jumping.
    let time = Math.random() * 40;
    let prev = 0;
    let stopAt = 0;

    function size() {
      const scale = Math.min(0.5, 960 / Math.max(1, canvas.clientWidth));
      const w = Math.max(160, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(90, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uPixelRatio, w / Math.max(1, canvas.clientWidth));
    }

    function draw() {
      if (!u || gl.isContextLost()) return;
      size();
      gl.uniform1f(u.uTime, time);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop(now) {
      if (!alive) return;
      if (!root.dataset.busy && now > stopAt) { raf = 0; return; }
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      time += Math.min(0.1, (now - prev) / 1000) * SPEED;
      prev = now;
      last = now;
      draw();
    }

    function run() {
      if (!u || raf || document.hidden) return;
      if (reduced) { draw(); return; }
      prev = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function onBusy() {
      if (root.dataset.busy) run();
      else stopAt = performance.now() + FADE_MS;
    }

    function begin() {
      u = build(gl);
      if (!u) return;
      setTheme(gl, u, readTheme());
      if (root.dataset.busy) run();
    }

    function onLost(e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      u = null;
    }
    function visibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (root.dataset.busy) run();
    }
    function onTheme(e) {
      if (!u) return;
      setTheme(gl, u, e.detail);
      if (!raf) draw();
    }

    const watch = new MutationObserver(onBusy);
    watch.observe(root, { attributes: true, attributeFilter: ['data-busy'] });
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', begin);
    window.addEventListener('riva-theme', onTheme);
    document.addEventListener('visibilitychange', visibility);
    begin();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      watch.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', begin);
      window.removeEventListener('riva-theme', onTheme);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return <canvas ref={ref} className="riva-glow" aria-hidden="true" />;
}
