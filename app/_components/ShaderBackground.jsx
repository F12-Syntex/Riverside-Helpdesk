'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * ShaderBackground — the light behind every page.
 *
 * One WebGL fragment shader, no dependencies, fixed behind the whole
 * shell. It is the app's equivalent of the sky Emergent puts behind its
 * opening screen: a slow mesh-drift of the practice's own colours —
 * NHS blue, NHS light blue, a touch of aqua — washed almost to white so
 * that dark text reads over it anywhere. It moves at the speed of
 * weather, never faster.
 *
 * Written in the idiom of the 21st.dev Shader Builder exports ("Mesh
 * drift"): a 4-colour palette, domain-warped value noise, a film-grain
 * pass. Kept in the same shape so a builder export can replace it later
 * by swapping the palette and the fragment body.
 *
 * WHAT IT DOES WHEN IT CANNOT
 * ---------------------------
 * No WebGL, a reduced-motion setting, or a lost context: the element
 * keeps a CSS gradient of the same palette and simply does not move.
 * The page never depends on the canvas being there.
 *
 * COST
 * ----
 * One quad, drawn at a third of the screen's resolution and stretched
 * — it is a blur, so nothing is lost — at thirty frames a second, and
 * paused whenever the tab is hidden. It is the only continuous animation on
 * the page, and it stops the moment the reader says they want less
 * motion.
 * ------------------------------------------------------------------ */

const PALETTE = {
  // Base, and three lights, as normalised RGB.
  base:  [0.965, 0.976, 0.984], // #f6f9fb — the page
  blue:  [0.000, 0.369, 0.722], // #005eb8 — NHS blue
  light: [0.255, 0.714, 0.902], // #41b6e6 — NHS light blue
  aqua:  [0.000, 0.643, 0.600], // #00a499 — NHS aqua green
  // Two more, for the Stitch-like spread of hue: a soft violet and a
  // warm pink, both tints rather than brand colours, so the blue stays
  // the thing the page is made of.
  violet: [0.560, 0.470, 0.960],
  pink:   [0.980, 0.600, 0.760],
};

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;
uniform vec3 u_c5;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * 0.085;

  // Domain warp: the field is folded through itself once, which is what
  // turns plain noise into the soft, cloud-like drift.
  vec2 q = vec2(fbm(p * 1.1 + vec2(t, -t * 0.7)), fbm(p * 1.1 + vec2(-t * 0.6, t * 0.9) + 3.7));
  vec2 r = p + 0.9 * (q - 0.5);
  float n1 = fbm(r * 1.3 + vec2(t * 0.5, 0.0));
  float n2 = fbm(r * 1.7 + vec2(-t * 0.3, t * 0.4) + 11.0);
  float n3 = fbm(r * 0.9 + vec2(t * 0.2, -t * 0.5) + 23.0);
  float n4 = fbm(r * 1.2 + vec2(-t * 0.45, -t * 0.25) + 41.0);
  float n5 = fbm(r * 1.5 + vec2(t * 0.35, t * 0.3) + 57.0);

  // Each light is a soft window on its own noise, biased to a corner so
  // the composition holds: light blue high and right, NHS blue low and
  // left, aqua as a thread between them.
  float wLight = smoothstep(0.35, 0.85, n1) * smoothstep(0.1, 0.9, uv.y * 0.6 + uv.x * 0.4);
  float wBlue  = smoothstep(0.42, 0.88, n2) * smoothstep(0.0, 0.8, (1.0 - uv.y) * 0.7 + (1.0 - uv.x) * 0.3);
  float wAqua  = smoothstep(0.50, 0.90, n3) * 0.6;
  float wViolet = smoothstep(0.40, 0.86, n4) * smoothstep(0.1, 0.9, uv.y * 0.6 + (1.0 - uv.x) * 0.5);
  float wPink   = smoothstep(0.48, 0.90, n5) * smoothstep(0.0, 0.8, (1.0 - uv.y) * 0.5 + uv.x * 0.6);

  // Washed to a tint: strength is what keeps body text readable over it.
  vec3 col = u_base;
  col = mix(col, u_c2, wLight  * 0.72);
  col = mix(col, u_c4, wViolet * 0.46);
  col = mix(col, u_c1, wBlue   * 0.50);
  col = mix(col, u_c5, wPink   * 0.36);
  col = mix(col, u_c3, wAqua   * 0.30);

  // A wash of the page at the foot, so the dock and any long answer sit
  // on something nearly plain.
  float foot = smoothstep(0.0, 0.42, uv.y);
  col = mix(u_base, col, 0.62 + 0.38 * foot);

  // Film grain, the same pass every Shader Builder export carries.
  float g = hash(gl_FragCoord.xy + fract(u_time)) - 0.5;
  col += g * 0.018;

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

// The still version, for every reader and machine the canvas is not for.
const FALLBACK =
  'radial-gradient(60% 55% at 82% 8%, rgba(65,182,230,.55) 0%, rgba(65,182,230,0) 70%),' +
  'radial-gradient(50% 50% at 12% 14%, rgba(143,120,245,.38) 0%, rgba(143,120,245,0) 70%),' +
  'radial-gradient(55% 60% at 10% 90%, rgba(0,94,184,.34) 0%, rgba(0,94,184,0) 70%),' +
  'radial-gradient(50% 50% at 88% 86%, rgba(250,153,194,.30) 0%, rgba(250,153,194,0) 70%),' +
  'radial-gradient(45% 45% at 60% 60%, rgba(0,164,153,.18) 0%, rgba(0,164,153,0) 70%),' +
  '#f6f9fb';

export default function ShaderBackground() {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return undefined;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return undefined;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_base'), PALETTE.base);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c1'), PALETTE.blue);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c2'), PALETTE.light);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c3'), PALETTE.aqua);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c4'), PALETTE.violet);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c5'), PALETTE.pink);

    let raf = 0;
    let alive = true;
    const start = performance.now();

    function size() {
      // A third of the screen, and never more than 640 across: the
      // shader is soft by design, so the browser scaling it up is free
      // detail nobody can see and a third of the pixels to shade.
      const scale = Math.min(0.34, 640 / Math.max(1, canvas.clientWidth));
      const w = Math.max(160, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(90, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    }

    function draw() {
      size();
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Thirty frames a second is more than a drift this slow can use.
    let last = 0;
    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw();
    }

    function visibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!reduced && !raf) raf = requestAnimationFrame(loop);
    }

    // The canvas is painted once before it is shown, so it never flashes
    // its fallback and then the shader.
    draw();
    canvas.style.opacity = '1';
    if (!reduced) raf = requestAnimationFrame(loop);
    window.addEventListener('resize', draw);
    document.addEventListener('visibilitychange', visibility);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', draw);
      document.removeEventListener('visibilitychange', visibility);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    };
  }, []);

  return (
    <div aria-hidden="true" className="riva-sky" style={{ background: FALLBACK }}>
      <canvas ref={ref} className="riva-sky-canvas" />
    </div>
  );
}
