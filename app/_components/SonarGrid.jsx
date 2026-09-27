'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * SonarGrid — the dot grid over the light, answering back.
 *
 * Drawn with three.js: one Points object, every dot on the GPU. The
 * grid breathes — a slow swell rolls across it, a few dots at a time
 * growing and fading — and a ring now and then spreads out through it.
 * Rings are rare while the page is idle and come more often while an
 * answer is being worked out (<html data-busy>), so the page still says
 * it is working without asking to be looked at the rest of the time.
 *
 * It sits behind the shell with pointer-events off, so clicks are heard
 * on the window rather than on the canvas: a click on bare page sends a
 * ring out from under it.
 *
 * COST
 * ----
 * three.js is loaded only once the page is up (a dynamic import). One
 * draw call, thirty frames a second, paused in a hidden tab, and a still
 * grid under reduced motion. No WebGL: nothing is drawn, and the light
 * behind (ShaderBackground) is left on its own.
 * ------------------------------------------------------------------ */

const MAX_DPR = 2;
const MAX_RINGS = 4;
const AREA = [0.12, 0.18, 0.88, 0.82];

// Things that are used, not looked through: a click on them is theirs.
const CONTROL = 'a, button, input, textarea, select, label, summary, video, audio, canvas, iframe, [role], [contenteditable], [tabindex], header, nav, dialog';

// A click belongs to the grid only when it lands on bare page: nothing
// under the pointer is a control, and nothing between it and the page
// paints a surface of its own (a card, a panel, the top bar).
function onBackdrop(target) {
  for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.matches && el.matches(CONTROL)) return false;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/,\s*0\)$/.test(bg)) return false;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return false;
  }
  return true;
}

const VERT = `
uniform float uTime;
uniform float uPx;
uniform float uRadius;
uniform float uBase;
uniform float uSpeed;
uniform float uWidth;
uniform float uLife;
uniform float uAmp;
uniform vec4 uRings[${MAX_RINGS}];
varying float vAlpha;
varying float vSize;

void main() {
  vec2 p = position.xy;

  // The swell: two slow waves crossing at an angle, so the bright patches
  // wander rather than march. Only the top of each wave shows at all.
  float s1 = sin(dot(p, vec2(0.0042, 0.0027)) - uTime * 0.32);
  float s2 = sin(dot(p, vec2(-0.0021, 0.0038)) - uTime * 0.21 + 1.7);
  float swell = smoothstep(0.35, 1.0, (s1 + s2) * 0.5 + 0.5);

  // Rings: x, y, born (seconds), and w = 1 while the slot is in use.
  float ring = 0.0;
  for (int i = 0; i < ${MAX_RINGS}; i++) {
    vec4 r = uRings[i];
    if (r.w < 0.5) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > uLife) continue;
    float d = abs(distance(p, r.xy) - age * uSpeed);
    if (d >= uWidth) continue;
    float t = 1.0 - d / uWidth;
    float k = t * t * (3.0 - 2.0 * t) * (1.0 - age / uLife);
    ring = max(ring, k);
  }

  float e = max(ring, swell * 0.35);
  vAlpha = uBase + (1.0 - uBase) * e;
  vSize = uRadius * (1.0 + uAmp * e);
  // Two spare pixels so the edge can be smoothed in the fragment shader.
  gl_PointSize = (vSize * 2.0 + 2.0) * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const FRAG = `
uniform vec3 uColor;
varying float vAlpha;
varying float vSize;

void main() {
  // Distance from the centre in CSS pixels; a one-pixel soft edge.
  float half_ = vSize + 1.0;
  float d = length(gl_PointCoord - 0.5) * 2.0 * half_;
  float a = 1.0 - smoothstep(vSize - 0.5, vSize + 0.5, d);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor, a * vAlpha);
}
`;

export default function SonarGrid({
  spacing = 30,
  dotRadius = 1.1,
  baseOpacity = 0.3,
  pingEvery = 14,
  busyPingEvery = 5,
  speed = 170,
  ringWidth = 130,
  amplitude = 1.3,
  pingArea = AREA,
  className,
}) {
  const hostRef = React.useRef(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disposed = false;
    let teardown = () => {};

    import('three').then((THREE) => {
      if (disposed) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
      } catch {
        return;
      }
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      host.appendChild(canvas);

      const scene = new THREE.Scene();
      // Pixel units with the origin at the top left, like the page.
      const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);

      const rings = Array.from({ length: MAX_RINGS }, () => new THREE.Vector4(0, 0, 0, 0));
      let nextSlot = 0;
      const uniforms = {
        uTime: { value: 0 },
        uPx: { value: 1 },
        uRadius: { value: dotRadius },
        uBase: { value: baseOpacity },
        uSpeed: { value: speed },
        uWidth: { value: ringWidth },
        uLife: { value: 1 },
        uAmp: { value: amplitude },
        uRings: { value: rings },
        uColor: { value: new THREE.Color() },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const geometry = new THREE.BufferGeometry();
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);

      const start = performance.now();
      const clock = () => (performance.now() - start) / 1000;
      const every = () => (document.documentElement.dataset.busy ? busyPingEvery : pingEvery);
      // The first ambient ring waits a full interval: the page opens quiet.
      let nextPing = every();
      let width = 1;
      let height = 1;
      let raf = 0;
      let last = 0;

      const readColor = () => { uniforms.uColor.value.setStyle(getComputedStyle(host).color); };

      const addRing = (x, y) => {
        rings[nextSlot].set(x, y, clock(), 1);
        nextSlot = (nextSlot + 1) % MAX_RINGS;
      };

      const render = () => {
        uniforms.uTime.value = reduceMotion.matches ? 0 : clock();
        renderer.render(scene, camera);
      };

      const resize = () => {
        const rect = host.getBoundingClientRect();
        width = Math.max(1, Math.round(rect.width));
        height = Math.max(1, Math.round(rect.height));
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        camera.right = width;
        camera.bottom = height;
        camera.updateProjectionMatrix();
        uniforms.uPx.value = dpr;
        uniforms.uLife.value = (Math.hypot(width, height) * 0.6 + ringWidth) / speed;

        const cols = Math.ceil(width / spacing) + 1;
        const rows = Math.ceil(height / spacing) + 1;
        const ox = (width - (cols - 1) * spacing) / 2;
        const oy = (height - (rows - 1) * spacing) / 2;
        const pos = new Float32Array(cols * rows * 3);
        let k = 0;
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            pos[k++] = ox + i * spacing;
            pos[k++] = oy + j * spacing;
            pos[k++] = 0;
          }
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        render();
      };

      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        if (now - last < 33) return;
        last = now;
        const t = clock();
        if (t >= nextPing) {
          const [x0, y0, x1, y1] = pingArea;
          addRing(width * (x0 + Math.random() * (x1 - x0)), height * (y0 + Math.random() * (y1 - y0)));
          nextPing = t + every();
        }
        render();
      };

      const run = () => {
        cancelAnimationFrame(raf);
        raf = 0;
        if (reduceMotion.matches) { render(); return; }
        if (!document.hidden) raf = requestAnimationFrame(loop);
      };

      const onDown = (e) => {
        if (reduceMotion.matches || !onBackdrop(e.target)) return;
        const rect = host.getBoundingClientRect();
        addRing(e.clientX - rect.left, e.clientY - rect.top);
      };
      const onVisibility = () => run();
      const onTheme = () => { readColor(); render(); };
      const onLost = (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; };
      const onRestored = () => { resize(); run(); };
      // Busy flips the ping rate; when it starts, pull the next ring in so
      // the page answers soon. Only a real flip counts: the root's style
      // changes for other reasons too.
      let wasBusy = !!document.documentElement.dataset.busy;
      const mo = new MutationObserver(() => {
        const busy = !!document.documentElement.dataset.busy;
        if (busy !== wasBusy) {
          wasBusy = busy;
          nextPing = Math.min(nextPing, clock() + (busy ? 0.6 : every()));
        }
        readColor();
      });

      const ro = new ResizeObserver(resize);
      readColor();
      resize();
      ro.observe(host);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-busy', 'data-theme', 'class', 'style'] });
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('riva-theme', onTheme);
      document.addEventListener('visibilitychange', onVisibility);
      reduceMotion.addEventListener('change', run);
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);
      run();

      teardown = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        mo.disconnect();
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('riva-theme', onTheme);
        document.removeEventListener('visibilitychange', onVisibility);
        reduceMotion.removeEventListener('change', run);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        canvas.remove();
      };
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, [spacing, dotRadius, baseOpacity, pingEvery, busyPingEvery, speed, ringWidth, amplitude, pingArea]);

  return <div ref={hostRef} aria-hidden="true" className={className} />;
}
