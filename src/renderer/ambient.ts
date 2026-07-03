import {
  Grid,
  RenderConfig,
  ColorPalette,
  DEFAULT_RENDER_CONFIG,
} from "../types";

/**
 * Ambient renderer — a rotating gallery of quiet, cell-based animations
 * played on top of the real contribution graph.
 *
 * All scenes except the Game of Life are CSS keyframe loops: the keyframes
 * are defined once per scene, and each cell only carries a class + a
 * negative animation-delay (its phase). This keeps the file an order of
 * magnitude smaller than enumerating frames, and every scene loops
 * seamlessly. The Game of Life scene is inherently event-based, so it uses
 * per-cell SMIL <animate> with discrete keyTimes instead.
 *
 * Timeline: SCENES.length x SCENE_SECONDS on one master cycle. Scene groups
 * crossfade via one SMIL opacity <animate> per group. The scene order is
 * fully shuffled by `seed`, so every render deals a fresh random ordering
 * of all scenes, and the random details (ripple origins, rain speeds,
 * firefly picks, burst positions) change too. Zero-contribution cells take
 * part in every scene at a softer intensity, so the whole canvas stays
 * alive.
 *
 * Constraint reminder: this SVG is served through GitHub's camo proxy
 * inside an <img>, so only SMIL/CSS animations work — no JS, no external
 * resources, no interactivity.
 */

const SCENE_SECONDS = 15;
const FADE_SECONDS = 2;
const MARGIN = 7;

/** Accent colors used by scenes, per theme */
interface SceneColors {
  aurora: [string, string, string];
  ripple: string;
  rain: string;
  firefly: string;
  /** One color per firework burst */
  fireworks: [string, string, string, string];
  /** Row colors bottom → top (7 rows) */
  equalizer: [string, string, string, string, string, string, string];
  /** One color per comet */
  comet: [string, string];
}

const DARK_SCENE_COLORS: SceneColors = {
  aurora: ["#2dd4bf", "#60a5fa", "#c084fc"],
  ripple: "#7ee2ff",
  rain: "#58a6ff",
  firefly: "#fde047",
  fireworks: ["#f472b6", "#38bdf8", "#a78bfa", "#fbbf24"],
  equalizer: [
    "#22c55e",
    "#4ade80",
    "#a3e635",
    "#facc15",
    "#fb923c",
    "#f87171",
    "#ef4444",
  ],
  comet: ["#fcd34d", "#7dd3fc"],
};

const LIGHT_SCENE_COLORS: SceneColors = {
  aurora: ["#0d9488", "#2563eb", "#9333ea"],
  ripple: "#0550ae",
  rain: "#0969da",
  firefly: "#d97706",
  fireworks: ["#db2777", "#0284c7", "#7c3aed", "#d97706"],
  equalizer: [
    "#15803d",
    "#16a34a",
    "#65a30d",
    "#ca8a04",
    "#ea580c",
    "#dc2626",
    "#b91c1c",
  ],
  comet: ["#b45309", "#0369a1"],
};

/** Deterministic PRNG so output is reproducible for a given seed */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SceneContext {
  grid: Grid;
  config: RenderConfig;
  palette: ColorPalette;
  colors: SceneColors;
  rng: () => number;
  /** Pixel position of a cell's top-left corner */
  px: (x: number) => number;
  py: (y: number) => number;
  /** Master cycle length in seconds */
  cycleSeconds: number;
  /** Absolute start time (s) of this scene's window on the master cycle */
  windowStart: number;
  /** SVG dimensions, for scene-wide dimming overlays */
  svgWidth: number;
  svgHeight: number;
}

interface SceneOutput {
  /** CSS rules (keyframes + shared classes) for this scene */
  css: string;
  /** SVG elements inside the scene group */
  body: string;
}

type SceneBuilder = (ctx: SceneContext) => SceneOutput;

/** Fraction of the master cycle, formatted for keyTimes */
function frac(seconds: number, cycleSeconds: number): string {
  return (seconds / cycleSeconds).toFixed(6);
}

/** Trim needless zeros: 0.50 -> .5, 3.00 -> 3 */
function num(n: number): string {
  return parseFloat(n.toFixed(2)).toString().replace(/^0\./, ".");
}

/** A translucent full-canvas veil so a scene can dim the base graph */
function dimVeil(ctx: SceneContext, opacity: number): string {
  if (opacity <= 0) return "";
  return `<rect x="0" y="0" width="${ctx.svgWidth}" height="${ctx.svgHeight}" fill="${ctx.palette.background}" fill-opacity="${num(opacity)}" />`;
}

// ============================================================
// Scene: aurora — a slow multicolor field drifting diagonally
// across every cell; empty days shimmer softly too
// ============================================================
function buildAurora(ctx: SceneContext): SceneOutput {
  const { grid, colors } = ctx;
  const [c0, c1, c2] = colors.aurora;
  const hueDur = 11;
  const shimmerDur = 7.3;

  // Level classes carry the peak (--p) and trough (--q) opacity;
  // empty cells join in at a subtle intensity
  const levelCss = [0, 1, 2, 3, 4]
    .map((l) => {
      const p = l > 0 ? 0.3 + 0.16 * l : 0.2;
      return `.a${l}{--p:${num(p)};--q:${num(p * 0.65)}}`;
    })
    .join("");
  const css =
    `.au{fill:${c0};fill-opacity:var(--p);animation-name:auh,aus;animation-duration:${hueDur}s,${shimmerDur}s;animation-timing-function:linear,ease-in-out;animation-iteration-count:infinite,infinite;animation-delay:var(--a),var(--b)}` +
    `@keyframes auh{0%,100%{fill:${c0}}34%{fill:${c1}}67%{fill:${c2}}}` +
    `@keyframes aus{0%,100%{fill-opacity:var(--q)}50%{fill-opacity:var(--p)}}` +
    levelCss;

  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      const a = num((x * 0.42 + y * 0.9) % hueDur);
      const b = num((x * 0.31 + y * 0.55) % shimmerDur);
      parts.push(
        `<rect class="c au a${lvl}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--a:-${a}s;--b:-${b}s"/>`
      );
    }
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: ripple — waves radiating from the most active cells;
// the wave brightens every cell it passes, active cells more
// ============================================================
function buildRipple(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const period = 7.2;
  const secPerDist = 0.24;

  // Pick up to 3 well-separated origins among high-activity cells
  const byLevel = (min: number) => {
    const list: { x: number; y: number }[] = [];
    for (let x = 0; x < grid.width; x++) {
      for (let y = 0; y < grid.height; y++) {
        if (grid.cells[x][y].contributionLevel >= min) list.push({ x, y });
      }
    }
    return list;
  };
  let candidates = byLevel(3);
  if (candidates.length < 3) candidates = byLevel(2);
  if (candidates.length < 3) candidates = byLevel(1);
  if (candidates.length === 0) {
    candidates = [
      { x: 13, y: 3 },
      { x: 26, y: 3 },
      { x: 39, y: 3 },
    ];
  }

  // Seeded shuffle, then greedy pick with a minimum separation
  const shuffled = candidates
    .map((c) => ({ c, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.c);
  const origins: { x: number; y: number }[] = [];
  for (const c of shuffled) {
    if (origins.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= 10)) {
      origins.push(c);
      if (origins.length === 3) break;
    }
  }
  if (origins.length === 0) origins.push(shuffled[0]);

  const levelCss = [0, 1, 2, 3, 4]
    .map((l) => `.r${l}{--p:${num(l > 0 ? 0.35 + 0.15 * l : 0.3)}}`)
    .join("");
  const css =
    `.rp{fill:${colors.ripple};fill-opacity:0;animation:rp ${period}s linear infinite;animation-delay:var(--d)}` +
    `@keyframes rp{0%,32%,100%{fill-opacity:0}5%{fill-opacity:var(--p)}}` +
    levelCss;

  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      const dist = Math.min(
        ...origins.map((o) => Math.hypot(o.x - x, o.y - y))
      );
      const delay = num((dist * secPerDist) % period);
      parts.push(
        `<rect class="c rp r${lvl}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--d:-${delay}s"/>`
      );
    }
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: pulse — the whole graph breathes; a soft brightness
// wave rolls diagonally, amplitude following contribution level
// ============================================================
function buildPulse(ctx: SceneContext): SceneOutput {
  const { grid, palette } = ctx;
  const dur = 5.2;
  const bright = palette.contributionColors[4];

  const levelCss = [0, 1, 2, 3, 4]
    .map((l) => `.b${l}{--p:${num(l > 0 ? 0.1 + 0.14 * l : 0.08)}}`)
    .join("");
  const css =
    `.pu{fill:${bright};fill-opacity:0;animation:pu ${dur}s ease-in-out infinite;animation-delay:var(--d)}` +
    `@keyframes pu{0%,100%{fill-opacity:0}50%{fill-opacity:var(--p)}}` +
    levelCss;

  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      const delay = num(((x + y) * 0.26) % dur);
      parts.push(
        `<rect class="c pu b${lvl}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--d:-${delay}s"/>`
      );
    }
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: rain — light drops fall down each column at its own
// seeded speed, briefly illuminating the cells they pass
// ============================================================
function buildRain(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const secPerRow = 0.085;

  const levelCss = [0, 1, 2, 3, 4]
    .map((l) => {
      const p = l > 0 ? 0.45 + 0.13 * l : 0.4;
      return `.n${l}{--p:${num(p)};--q:${num(p * 0.12)}}`;
    })
    .join("");

  // Per-column duration classes (each column rains at its own pace)
  const columnCss: string[] = [];
  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    const period = 2.8 + rng() * 2.6;
    const phase = rng() * period;
    columnCss.push(`.k${x}{animation-duration:${num(period)}s}`);
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      const delay = num((phase + y * secPerRow) % period);
      parts.push(
        `<rect class="c rn n${lvl} k${x}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--d:-${delay}s"/>`
      );
    }
  }

  const css =
    `.rn{fill:${colors.rain};fill-opacity:0;animation-name:rn;animation-timing-function:linear;animation-iteration-count:infinite;animation-delay:var(--d)}` +
    `@keyframes rn{0%,100%{fill-opacity:0}3.5%{fill-opacity:var(--p)}40%{fill-opacity:var(--q)}}` +
    levelCss +
    columnCss.join("");

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: fireflies — a seeded handful of cells (dark days
// included) glow in and out at their own pace over the graph
// ============================================================
function buildFireflies(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const candidates: { x: number; y: number; lvl: number }[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      candidates.push({ x, y, lvl: grid.cells[x][y].contributionLevel });
    }
  }

  const shuffled = candidates
    .map((c) => ({ c, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.c);
  const picked = shuffled.slice(0, Math.min(70, shuffled.length));

  const levelCss = [0, 1, 2, 3, 4]
    .map((l) => `.f${l}{--p:${num(l > 0 ? 0.5 + 0.12 * l : 0.4)}}`)
    .join("");
  const css =
    `.ff{fill:${colors.firefly};fill-opacity:0;animation-name:ff;animation-timing-function:ease-in-out;animation-iteration-count:infinite}` +
    `@keyframes ff{0%,100%{fill-opacity:0}50%{fill-opacity:var(--p)}}` +
    levelCss;

  const parts: string[] = [];
  for (const { x, y, lvl } of picked) {
    const dur = num(3.5 + rng() * 4);
    const delay = num(rng() * parseFloat(dur));
    parts.push(
      `<rect class="c ff f${lvl}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="animation-duration:${dur}s;animation-delay:-${delay}s"/>`
    );
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: life — Conway's Game of Life (B3/S23, torus) seeded
// from the contribution graph itself; the original graph is
// re-injected whenever the population dies out or stagnates
// ============================================================
function buildLife(ctx: SceneContext): SceneOutput {
  const { grid, palette, cycleSeconds, windowStart } = ctx;
  const W = grid.width;
  const H = grid.height;
  const size = W * H;
  const stepSec = 0.6;
  const showAt = windowStart + 0.5;
  const lastStepAt = windowStart + SCENE_SECONDS - 2.0;

  const seedState = (minLevel: number): boolean[] => {
    const s = new Array<boolean>(size).fill(false);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if (grid.cells[x][y].contributionLevel >= minLevel) s[x * H + y] = true;
      }
    }
    return s;
  };

  let initial = seedState(2);
  if (initial.filter(Boolean).length < 25) initial = seedState(1);

  const evolve = (s: boolean[]): boolean[] => {
    const next = new Array<boolean>(size).fill(false);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let n = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + W) % W;
            const ny = (y + dy + H) % H;
            if (s[nx * H + ny]) n++;
          }
        }
        const idx = x * H + y;
        next[idx] = s[idx] ? n === 2 || n === 3 : n === 3;
      }
    }
    return next;
  };

  // Per-cell flip events, encoded straight into values/keyTimes pairs.
  // Every animated cell starts invisible at keyTime 0.
  const values = new Map<number, string[]>();
  const keyTimes = new Map<number, string[]>();
  const pushFlip = (idx: number, atSec: number, on: boolean) => {
    if (!values.has(idx)) {
      values.set(idx, ["0"]);
      keyTimes.set(idx, ["0"]);
    }
    values.get(idx)!.push(on ? "1" : "0");
    keyTimes.get(idx)!.push(frac(atSec, cycleSeconds));
  };

  let current = initial.slice();
  current.forEach((alive, idx) => {
    if (alive) pushFlip(idx, showAt, true);
  });

  const history: string[] = [];
  let stagnation = 0;
  for (let t = showAt + stepSec; t <= lastStepAt; t += stepSec) {
    let next = evolve(current);

    const hash = next.map((b) => (b ? "1" : "0")).join("");
    if (history.includes(hash)) stagnation++;
    else stagnation = 0;
    history.push(hash);
    if (history.length > 6) history.shift();

    const population = next.filter(Boolean).length;
    if (population < 6 || stagnation >= 8) {
      const merged = next.map((b, i) => b || initial[i]);
      // If re-injecting the graph changes nothing, hard-reset instead
      next = merged.every((b, i) => b === next[i]) ? initial.slice() : merged;
      stagnation = 0;
      history.length = 0;
    }

    next.forEach((alive, idx) => {
      if (alive !== current[idx]) pushFlip(idx, t, alive);
    });
    current = next;
  }

  const aliveColor = palette.contributionColors[4];
  const parts: string[] = [];
  for (const [idx, vals] of values) {
    const x = Math.floor(idx / H);
    const y = idx % H;
    parts.push(
      `<rect class="c" x="${ctx.px(x)}" y="${ctx.py(y)}" fill="${aliveColor}" fill-opacity="0"><animate attributeName="fill-opacity" values="${vals.join(";")}" keyTimes="${keyTimes.get(idx)!.join(";")}" dur="${cycleSeconds}s" repeatCount="indefinite" calcMode="discrete" /></rect>`
    );
  }

  return { css: "", body: parts.join("\n    ") };
}

// ============================================================
// Scene: fireworks — colorful shells launch one after another
// across the graph; each cell flashes with its nearest burst,
// then lingers as afterglow before the sky goes dark again
// ============================================================
function buildFireworks(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const period = 9;
  const secPerDist = 0.055;
  const burstCount = colors.fireworks.length;

  // Bursts spread across the width at staggered launch times
  const origins: { x: number; y: number; at: number }[] = [];
  for (let i = 0; i < burstCount; i++) {
    origins.push({
      x: ((i + 0.15 + rng() * 0.7) * grid.width) / burstCount,
      y: 1 + rng() * (grid.height - 2),
      at: (i * period) / burstCount + rng() * 0.7,
    });
  }

  const originCss = colors.fireworks
    .map((c, i) => `.w${i}{fill:${c}}`)
    .join("");
  const css =
    `.fw{fill-opacity:0;animation:fw ${period}s ease-out infinite;animation-delay:var(--d)}` +
    `@keyframes fw{0%,100%{fill-opacity:0}1.5%{fill-opacity:var(--p)}8%{fill-opacity:var(--q)}24%{fill-opacity:0}}` +
    originCss;

  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < origins.length; i++) {
        const d = Math.hypot(origins[i].x - x, origins[i].y - y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      const delay = num((origins[best].at + bestDist * secPerDist) % period);
      const levelPeak = lvl > 0 ? 0.55 + 0.11 * lvl : 0.45;
      const p = levelPeak * Math.max(0.3, 1 - bestDist * 0.035);
      parts.push(
        `<rect class="c fw w${best}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--d:-${delay}s;--p:${num(p)};--q:${num(p * 0.3)}"/>`
      );
    }
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: equalizer — every column bounces like a spectrum
// analyzer bar at its own pace, green at the bottom shading
// to red at the top; contribution level sets the brightness
// ============================================================
function buildEqualizer(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const H = grid.height;

  // A column's bar height follows |sin|; a cell at depth d (0 = bottom
  // row) is lit while the bar tops its height, so upper rows only flash
  // around the peak of each bounce
  const rowCss: string[] = [];
  for (let d = 0; d < H; d++) {
    const s = Math.min((d + 0.7) / H, 0.98);
    const a = (Math.asin(s) / Math.PI) * 100;
    const lo = Math.max(a - 1.5, 0.2).toFixed(1);
    const hi = (a + 1.5).toFixed(1);
    const color = colors.equalizer[Math.min(d, colors.equalizer.length - 1)];
    rowCss.push(
      `.g${d}{fill:${color};animation-name:q${d}}` +
        `@keyframes q${d}{0%,${lo}%{fill-opacity:0}${hi}%,${(100 - a - 1.5).toFixed(1)}%{fill-opacity:var(--p)}${(100 - a + 1.5).toFixed(1)}%,100%{fill-opacity:0}}`
    );
  }

  const levelCss = [0, 1, 2, 3, 4]
    .map((l) => `.e${l}{--p:${num(l > 0 ? 0.5 + 0.12 * l : 0.42)}}`)
    .join("");

  // Whole columns share duration + phase, so each bar moves as one
  const columnCss: string[] = [];
  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    const bounce = 1.5 + rng() * 1.3;
    const phase = rng() * bounce;
    columnCss.push(
      `.u${x}{animation-duration:${num(bounce)}s;animation-delay:-${num(phase)}s}`
    );
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      const depth = H - 1 - y;
      parts.push(
        `<rect class="c eq g${depth} e${lvl} u${x}" x="${ctx.px(x)}" y="${ctx.py(y)}"/>`
      );
    }
  }

  const css =
    `.eq{fill-opacity:0;animation-timing-function:linear;animation-iteration-count:infinite}` +
    rowCss.join("") +
    levelCss +
    columnCss.join("");

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: comet — two comets streak across the sky in opposite
// directions along gentle sine paths, each trailing a slowly
// fading glow; far-away cells still twinkle faintly in passing
// ============================================================
function buildComet(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const W = grid.width;
  const H = grid.height;
  const period = 7.5;
  const travel = 5;

  const comets = colors.comet.map((_, i) => ({
    at: (i * period) / colors.comet.length + rng() * 0.5,
    dir: i % 2 === 0 ? 1 : -1,
    amp: 1.4 + rng() * 1.2,
    freq: 0.18 + rng() * 0.14,
    phase: rng() * Math.PI * 2,
  }));

  const pathY = (c: (typeof comets)[number], x: number): number =>
    (H - 1) / 2 + c.amp * Math.sin(c.freq * x + c.phase);

  const cometCss = colors.comet.map((c, i) => `.t${i}{fill:${c}}`).join("");
  const css =
    `.cm{fill-opacity:0;animation:cm ${period}s linear infinite;animation-delay:var(--d)}` +
    `@keyframes cm{0%,100%{fill-opacity:0}2%{fill-opacity:var(--p)}12%{fill-opacity:var(--q)}42%{fill-opacity:0}}` +
    cometCss;

  const parts: string[] = [];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      // Each cell follows whichever comet passes closer to it
      let best = 0;
      let bestG = -1;
      for (let i = 0; i < comets.length; i++) {
        const dy = y - pathY(comets[i], x);
        const g = Math.exp(-(dy * dy) / 1.8);
        if (g > bestG) {
          bestG = g;
          best = i;
        }
      }
      const c = comets[best];
      const progress = c.dir > 0 ? x : W - 1 - x;
      const delay = num((c.at + (progress * travel) / (W - 1)) % period);
      const levelPeak = lvl > 0 ? 0.5 + 0.11 * lvl : 0.4;
      const p = levelPeak * (0.22 + 0.78 * bestG);
      parts.push(
        `<rect class="c cm t${best}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--d:-${delay}s;--p:${num(p)};--q:${num(p * 0.3)}"/>`
      );
    }
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Assembly
// ============================================================

interface SceneDef {
  name: string;
  build: SceneBuilder;
  /** How much to dim the base graph while this scene plays */
  dim: number;
}

const SCENES: SceneDef[] = [
  { name: "aurora", build: buildAurora, dim: 0 },
  { name: "ripple", build: buildRipple, dim: 0 },
  { name: "pulse", build: buildPulse, dim: 0 },
  { name: "rain", build: buildRain, dim: 0.25 },
  { name: "fireflies", build: buildFireflies, dim: 0.35 },
  { name: "life", build: buildLife, dim: 0.55 },
  { name: "fireworks", build: buildFireworks, dim: 0.5 },
  { name: "equalizer", build: buildEqualizer, dim: 0.4 },
  { name: "comet", build: buildComet, dim: 0.5 },
];

/**
 * Crossfade envelope for a scene group on the master cycle.
 * Scene i is visible during [i, i+1] * SCENE_SECONDS, fading in over the last
 * FADE_SECONDS of the previous window and out over its own last
 * FADE_SECONDS, so adjacent scenes crossfade instead of gap to black.
 */
function sceneGroup(
  inner: string,
  index: number,
  sceneCount: number,
  name: string,
  cycleSeconds: number
): string {
  const t0 = index * SCENE_SECONDS;
  const t1 = t0 + SCENE_SECONDS;
  const f = (s: number) => frac(s, cycleSeconds);

  let valuesAttr: string;
  let keyTimesAttr: string;
  if (index === 0) {
    // Fades back in at the very end of the cycle (wraps around)
    valuesAttr = "1;1;0;0;1";
    keyTimesAttr = `0;${f(t1 - FADE_SECONDS)};${f(t1)};${f(cycleSeconds - FADE_SECONDS)};1`;
  } else if (index === sceneCount - 1) {
    valuesAttr = "0;0;1;1;0";
    keyTimesAttr = `0;${f(t0 - FADE_SECONDS)};${f(t0)};${f(t1 - FADE_SECONDS)};1`;
  } else {
    valuesAttr = "0;0;1;1;0;0";
    keyTimesAttr = `0;${f(t0 - FADE_SECONDS)};${f(t0)};${f(t1 - FADE_SECONDS)};${f(t1)};1`;
  }

  // First scene stays visible if SMIL is unsupported (static fallback)
  const staticOpacity = index === 0 ? "1" : "0";
  return `  <g data-scene="${name}" opacity="${staticOpacity}">
    <animate attributeName="opacity" values="${valuesAttr}" keyTimes="${keyTimesAttr}" dur="${cycleSeconds}s" repeatCount="indefinite" />
    ${inner}
  </g>`;
}

/**
 * Render the ambient multi-scene SVG.
 *
 * @param seed Integer that shuffles the scene order and drives all seeded
 *             randomness. Pass days-since-epoch for a daily-changing SVG.
 */
export function renderAmbientSVG(
  grid: Grid,
  config: RenderConfig = DEFAULT_RENDER_CONFIG,
  seed: number = 0
): string {
  const { cellSize, cellGap, cellRadius, palette } = config;
  const step = cellSize + cellGap;
  const svgWidth = grid.width * step - cellGap + MARGIN * 2;
  const svgHeight = grid.height * step - cellGap + MARGIN * 2;
  const colors = config.darkMode ? DARK_SCENE_COLORS : LIGHT_SCENE_COLORS;
  const cycleSeconds = SCENES.length * SCENE_SECONDS;

  // Fisher-Yates shuffle of the full scene order, on its own PRNG stream so
  // the scene-detail randomness below stays independent of the ordering.
  const orderRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const ordered = [...SCENES];
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(orderRng() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  const rng = mulberry32((seed ^ 0x02f6e2b1) >>> 0);
  const px = (x: number) => MARGIN + x * step;
  const py = (y: number) => MARGIN + y * step;

  // Static base: the real contribution graph, always visible underneath
  const baseRects: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      baseRects.push(
        `<rect class="c" x="${px(x)}" y="${py(y)}" fill="${palette.contributionColors[lvl]}"/>`
      );
    }
  }

  const cssBlocks: string[] = [
    `.c{width:${cellSize}px;height:${cellSize}px;rx:${cellRadius}px}`,
  ];
  const groups = ordered.map((scene, i) => {
    const ctx: SceneContext = {
      grid,
      config,
      palette,
      colors,
      rng,
      px,
      py,
      cycleSeconds,
      windowStart: i * SCENE_SECONDS,
      svgWidth,
      svgHeight,
    };
    const { css, body } = scene.build(ctx);
    if (css) cssBlocks.push(css);
    const inner = dimVeil(ctx, scene.dim) + "\n    " + body;
    return sceneGroup(inner, i, ordered.length, scene.name, cycleSeconds);
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <title>Contribution graph ambient animation — ${ordered.map((s) => s.name).join(" → ")}, one scene every ${SCENE_SECONDS}s</title>
  <!-- generated by contribution-gallery ambient renderer (seed ${seed}) -->
  <style>${cssBlocks.join("\n")}</style>
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${palette.background}" rx="6" />
  <g>
    ${baseRects.join("\n    ")}
  </g>
${groups.join("\n")}
</svg>
`;
}
