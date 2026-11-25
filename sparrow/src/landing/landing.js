// The public landing page: an original procedural "glass sculpture in a midnight sky" (WebGL), scroll reveals,
// and the grade-by-grade plan preview from Sparrow's real roadmap.
import { ROADMAP, TERMS } from "../../../shared/taxonomy.mjs";
import { applyEffects, effectsSetting } from "../lib/effects.js";

// ?still renders one crisp frame (used to make the social preview image).
const still = new URLSearchParams(location.search).has("still");
const effects = still ? "full" : applyEffects(effectsSetting());
if (still) document.documentElement.classList.add("still");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- nav ----------
const nav = document.getElementById("site-nav");
const onScroll = () => nav?.classList.toggle("is-scrolled", scrollY > 12);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- reveals ----------
const targets = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && !reducedMotion) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  targets.forEach((t, i) => {
    t.style.setProperty("--reveal-delay", `${(i % 4) * 70}ms`);
    io.observe(t);
  });
} else targets.forEach((t) => t.classList.add("is-in"));

// ---------- glint on interactive glass ----------
for (const el of document.querySelectorAll(".glass--interactive"))
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });

// ---------- grade plans ----------
const panel = document.getElementById("grades-panel");
const tabs = [...document.querySelectorAll("[data-grade]")];
function showGrade(grade) {
  const year = ROADMAP[grade];
  for (const t of tabs) {
    const on = t.dataset.grade === String(grade);
    t.setAttribute("aria-pressed", String(on));
    t.setAttribute("aria-selected", String(on));
  }
  panel.replaceChildren();
  const title = document.createElement("h3");
  title.className = "grades__title";
  title.textContent = year.title;
  const cols = document.createElement("div");
  cols.className = "grades__cols";
  for (const term of TERMS) {
    const col = document.createElement("div");
    const h = document.createElement("p");
    h.className = "kicker";
    h.textContent = term.label;
    const ul = document.createElement("ul");
    for (const item of year.terms[term.id]) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.append(li);
    }
    col.append(h, ul);
    cols.append(col);
  }
  panel.append(title, cols);
}
tabs.forEach((t) => t.addEventListener("click", () => showGrade(t.dataset.grade)));
if (panel) showGrade(9);

// ---------- hero art ----------
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uShift;
uniform float uShiftY;
uniform float uZoom;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

vec3 sky(vec3 d) {
  float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.03, 0.12, 0.42), vec3(0.008, 0.02, 0.07), smoothstep(0.3, 1.0, t));
  c = mix(vec3(0.10, 0.38, 0.95), c, smoothstep(0.0, 0.45, t));
  c += vec3(0.29, 0.30, 1.0) * pow(max(dot(d, normalize(vec3(-0.7, 0.45, -0.6))), 0.0), 6.0) * 0.55;
  c += vec3(0.13, 0.83, 0.93) * pow(max(dot(d, normalize(vec3(0.8, -0.15, -0.55))), 0.0), 9.0) * 0.5;
  c += vec3(0.56, 0.82, 1.0) * pow(max(dot(d, normalize(vec3(0.1, 0.9, -0.2))), 0.0), 24.0) * 0.6;
  return c;
}

float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

float map(vec3 p) {
  vec3 q = p;
  q.xy *= rot(0.6 + 0.18 * sin(uTime * 0.27));
  q.yz *= rot(uTime * 0.16 + 0.8);
  float d = sdTorus(q, vec2(0.92, 0.27));
  d += 0.045 * sin(q.x * 3.8 + uTime * 0.8) * sin(q.z * 3.6 - uTime * 0.6);
  vec3 a = p - vec3(0.95 * sin(uTime * 0.31), 0.55 * cos(uTime * 0.26), 0.35 * sin(uTime * 0.37));
  d = smin(d, length(a) - 0.36, 0.5);
  vec3 b = p - vec3(-0.8 * cos(uTime * 0.22), -0.55 * sin(uTime * 0.33), 0.25 * cos(uTime * 0.29));
  d = smin(d, length(b) - 0.24, 0.42);
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 suv = uv;
  uv.x -= uShift;
  uv.y -= uShiftY;
  vec3 ro = vec3(0.0, 0.0, uZoom);
  vec3 rd = normalize(vec3(uv, -1.65));
  mat2 yaw = rot(uPointer.x * 0.22), pitch = rot(uPointer.y * 0.14);
  ro.xz *= yaw; rd.xz *= yaw; ro.yz *= pitch; rd.yz *= pitch;

  vec3 col = sky(normalize(vec3(suv, -1.65)));
  float c = fbm(suv * vec2(1.4, 3.2) + vec2(uTime * 0.012, 0.0));
  float band = 1.0 - smoothstep(-0.05, 0.55, suv.y);
  col += vec3(0.32, 0.58, 1.0) * smoothstep(0.52, 0.92, c) * 0.32 * band;
  col += vec3(0.6, 0.8, 1.0) * smoothstep(0.75, 1.0, c) * 0.12 * band;

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 70; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0015) { hit = true; break; }
    t += d * 0.9;
    if (t > 7.5) break;
  }
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
    vec3 r = vec3(sky(refract(rd, n, 0.69)).r, sky(refract(rd, n, 0.675)).g, sky(refract(rd, n, 0.66)).b);
    vec3 refl = sky(reflect(rd, n));
    vec3 glass = mix(r * vec3(0.78, 0.95, 1.25), refl, 0.15 + 0.75 * fres);
    vec3 h = reflect(rd, n);
    glass += vec3(0.75, 0.9, 1.0) * pow(max(dot(h, normalize(vec3(0.35, 0.85, 0.4))), 0.0), 48.0) * 1.4;
    glass += vec3(0.25, 0.55, 1.0) * fres * 0.7;
    glass += vec3(0.1, 0.35, 0.9) * (0.5 + 0.5 * n.y) * 0.18;
    col = mix(col, glass, 0.96);
  }
  col *= 1.0 - 0.28 * dot(suv, suv);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.02;
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}`;

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

function startHero() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas || effects === "reduced") return;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  if (!gl) return;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime");
  const uPointer = gl.getUniformLocation(prog, "uPointer"), uShift = gl.getUniformLocation(prog, "uShift"), uShiftY = gl.getUniformLocation(prog, "uShiftY"), uZoom = gl.getUniformLocation(prog, "uZoom");
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  let scale = still ? 1 : Math.min(0.85, 1.2 / (devicePixelRatio || 1));
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.min(1600, Math.round(r.width * scale)));
    const h = Math.max(1, Math.min(1000, Math.round(r.height * scale)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  };
  resize();
  addEventListener("resize", resize);

  let visible = true, last = 0, frames = 0, sampleStart = performance.now();
  const t0 = performance.now() - 14_000;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);
  const draw = (now) => {
    const wide = canvas.width / canvas.height > 1.25;
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reducedMotion ? 20.0 : (now - t0) / 1000);
    gl.uniform2f(uPointer, reducedMotion ? 0 : pointer.x, reducedMotion ? 0 : pointer.y);
    gl.uniform1f(uShift, wide ? 0.56 : 0.12);
    gl.uniform1f(uShiftY, wide ? 0.02 : 0.3);
    gl.uniform1f(uZoom, wide ? 4.6 : 7.2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  canvas.parentElement.classList.add("is-live");
  if (reducedMotion || still) {
    draw(t0 + 21_500);
    return;
  }
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (!visible || document.hidden || now - last < 33) return;
    last = now;
    draw(now);
    // Adapt resolution to keep slower GPUs smooth.
    frames++;
    if (now - sampleStart > 2000) {
      const fps = (frames * 1000) / (now - sampleStart);
      if (fps < 24 && scale > 0.45) {
        scale -= 0.1;
        resize();
      }
      frames = 0;
      sampleStart = now;
    }
  };
  requestAnimationFrame(loop);
}
startHero();
