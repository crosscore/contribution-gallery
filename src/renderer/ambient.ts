import {
  Grid,
  RenderConfig,
  ColorPalette,
  DEFAULT_RENDER_CONFIG,
} from "../types";
import { cardSurface, galleryCss, galleryTheme, GalleryTheme, pixelMark } from "./theme";

/**
 * Ambient renderer — a rotating gallery of quiet, cell-based light scenes
 * played on top of the real contribution graph.
 *
 * All scenes except the Game of Life are CSS keyframe loops: the keyframes
 * are defined once per scene, and each cell only carries a class + a
 * negative animation-delay (its phase). This keeps the file an order of
 * magnitude smaller than enumerating frames, and every scene loops
 * seamlessly. The Game of Life scene is inherently event-based, so it uses
 * per-cell SMIL <animate> with short linear ramps between its states.
 *
 * Visual system: every scene draws from one palette per theme — the same
 * teal → sky → violet spectrum as the heading, plus a single warm amber —
 * so the nine scenes read as one piece rather than nine effects. A blurred
 * <use> copy of the scene layer sits underneath the crisp cells and gives
 * lit cells a soft bloom at no file-size cost.
 *
 * Timeline: SCENES.length x SCENE_SECONDS on one master cycle. Scene groups
 * crossfade with eased SMIL opacity envelopes. The scene order is fully
 * shuffled by `seed`, so every render deals a fresh random ordering of all
 * scenes, and the random details (ripple origins, rain speeds, firefly
 * picks, burst positions, comet paths) change too. Zero-contribution cells
 * take part in every scene at a softer intensity, so the whole canvas
 * stays alive.
 *
 * Constraint reminder: this SVG is served through GitHub's camo proxy
 * inside an <img>, so only SMIL/CSS animations work — no JS, no external
 * resources, no interactivity.
 */

const SCENE_SECONDS = 15;
const FADE_SECONDS = 2.5;
const LABEL_FADE = 0.35;
const MARGIN = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Accent colors used by scenes, per theme */
interface SceneColors {
  aurora: [string, string, string];
  ripple: string;
  /** Tide rows, sea floor → crest (7 rows) */
  tide: string[];
  rain: string;
  firefly: string;
  life: string;
  /** One color per firework burst */
  fireworks: [string, string, string, string];
  /** Equalizer rows, bottom → top (7 rows) */
  equalizer: string[];
  /** One color per comet */
  comet: [string, string];
}

const DARK_SCENE_COLORS: SceneColors = {
  aurora: ["#5eead4", "#7dd3fc", "#c4b5fd"],
  ripple: "#9be7ff",
  tide: ["#0f766e", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4", "#ccfbf1", "#f0fdfa"],
  rain: "#8ab4ff",
  firefly: "#fcd34d",
  life: "#b9f6ca",
  fireworks: ["#f9a8d4", "#7dd3fc", "#c4b5fd", "#fcd34d"],
  equalizer: ["#39d353", "#4ade80", "#56e0bd", "#67e8f9", "#7dd3fc", "#a5b4fc", "#c4b5fd"],
  comet: ["#fcd34d", "#7dd3fc"],
};

const LIGHT_SCENE_COLORS: SceneColors = {
  aurora: ["#0d9488", "#2563eb", "#7c3aed"],
  ripple: "#0369a1",
  tide: ["#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59"],
  rain: "#2563eb",
  firefly: "#d97706",
  life: "#1a7f37",
  fireworks: ["#db2777", "#0284c7", "#7c3aed", "#d97706"],
  equalizer: ["#2da44e", "#1f9e7a", "#0d9488", "#0891b2", "#2563eb", "#4f46e5", "#7c3aed"],
  comet: ["#d97706", "#0369a1"],
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
  return (seconds / cycleSeconds).toFixed(5);
}

/** Trim needless zeros: 0.50 -> .5, 3.00 -> 3 */
function num(n: number): string {
  return parseFloat(n.toFixed(2)).toString().replace(/^0\./, ".");
}

/** Cell classes carrying the peak (--p) and trough (--q) opacity per contribution level */
function levelCss(prefix: string, peak: (level: number) => number, troughRatio = 0): string {
  return [0, 1, 2, 3, 4]
    .map((l) => `.${prefix}${l}{--p:${num(peak(l))}${troughRatio ? `;--q:${num(peak(l) * troughRatio)}` : ""}}`)
    .join("");
}

// ============================================================
// Scene: aurora — a slow multicolor field drifting diagonally
// across every cell; empty days shimmer softly too
// ============================================================
function buildAurora(ctx: SceneContext): SceneOutput {
  const { grid, colors } = ctx;
  const [c0, c1, c2] = colors.aurora;
  const hueDur = 14;
  const shimmerDur = 8.2;

  const css =
    `.au{fill:${c0};fill-opacity:var(--p);animation-name:auh,aus;animation-duration:${hueDur}s,${shimmerDur}s;animation-timing-function:linear,ease-in-out;animation-iteration-count:infinite,infinite;animation-delay:var(--a),var(--b)}` +
    `@keyframes auh{0%,100%{fill:${c0}}34%{fill:${c1}}67%{fill:${c2}}}` +
    `@keyframes aus{0%,100%{fill-opacity:var(--q)}50%{fill-opacity:var(--p)}}` +
    levelCss("a", (l) => (l > 0 ? 0.3 + 0.16 * l : 0.2), 0.6);

  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      const a = num((x * 0.5 + y * 1.1) % hueDur);
      const b = num((x * 0.33 + y * 0.6) % shimmerDur);
      parts.push(
        `<rect class="c au a${lvl}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="--a:-${a}s;--b:-${b}s"/>`
      );
    }
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: ripple — waves radiating from the most active cells;
// each wave brightens the cells it passes and leaves a soft wake
// ============================================================
function buildRipple(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const period = 7.6;
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

  const css =
    `.rp{fill:${colors.ripple};fill-opacity:0;animation:rp ${period}s linear infinite;animation-delay:var(--d)}` +
    `@keyframes rp{0%,36%,100%{fill-opacity:0}4%{fill-opacity:var(--p)}14%{fill-opacity:var(--q)}}` +
    levelCss("r", (l) => (l > 0 ? 0.38 + 0.15 * l : 0.3), 0.45);

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
// Scene: tide — one long sine wave travels across the year,
// deep teal at the sea floor rising to pale foam at each crest;
// the whole graph rolls as a single coherent swell
// ============================================================
function buildTide(ctx: SceneContext): SceneOutput {
  const { grid, colors } = ctx;
  const W = grid.width;
  const H = grid.height;
  const period = 6.8;
  const wavelengths = 1.35;
  const soft = 3.5;

  // A cell at depth d (0 = bottom row) is lit while the water level
  // 1 + 3·(1 + sin θ) tops it; θ starts at the trough so every window
  // sits inside a single period without wrapping
  const rowCss: string[] = [];
  for (let d = 0; d < H; d++) {
    const color = colors.tide[Math.min(d, colors.tide.length - 1)];
    const v = (d - 3.5) / 3;
    if (v <= -1) {
      rowCss.push(`.h${d}{fill:${color};fill-opacity:var(--p);animation:none}`);
      continue;
    }
    const a = ((Math.asin(v) + Math.PI / 2) / (2 * Math.PI)) * 100;
    const b = ((3 * Math.PI / 2 - Math.asin(v)) / (2 * Math.PI)) * 100;
    const lo0 = Math.max(a - soft, 0).toFixed(1);
    const lo1 = Math.min(a + soft, b).toFixed(1);
    const hi0 = Math.max(b - soft, a).toFixed(1);
    const hi1 = Math.min(b + soft, 100).toFixed(1);
    rowCss.push(
      `.h${d}{fill:${color};animation-name:tw${d}}` +
        `@keyframes tw${d}{0%,${lo0}%{fill-opacity:0}${lo1}%,${hi0}%{fill-opacity:var(--p)}${hi1}%,100%{fill-opacity:0}}`
    );
  }

  const columnCss: string[] = [];
  const parts: string[] = [];
  for (let x = 0; x < W; x++) {
    const delay = (((W - 1 - x) / (W - 1)) * wavelengths * period) % period;
    columnCss.push(`.v${x}{animation-delay:-${num(delay)}s}`);
    for (let y = 0; y < H; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      parts.push(
        `<rect class="c td h${H - 1 - y} o${lvl} v${x}" x="${ctx.px(x)}" y="${ctx.py(y)}"/>`
      );
    }
  }

  const css =
    `.td{fill-opacity:0;animation-duration:${period}s;animation-timing-function:linear;animation-iteration-count:infinite}` +
    rowCss.join("") +
    levelCss("o", (l) => (l > 0 ? 0.5 + 0.11 * l : 0.42)) +
    columnCss.join("");

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: rain — light drops fall down each column at its own
// seeded speed, briefly illuminating the cells they pass
// ============================================================
function buildRain(ctx: SceneContext): SceneOutput {
  const { grid, colors, rng } = ctx;
  const secPerRow = 0.085;

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
    levelCss("n", (l) => (l > 0 ? 0.45 + 0.13 * l : 0.4), 0.12) +
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
  const picked = shuffled.slice(0, Math.min(60, shuffled.length));

  const css =
    `.ff{fill:${colors.firefly};fill-opacity:0;animation-name:ff;animation-timing-function:ease-in-out;animation-iteration-count:infinite}` +
    `@keyframes ff{0%,100%{fill-opacity:0}50%{fill-opacity:var(--p)}}` +
    levelCss("f", (l) => (l > 0 ? 0.5 + 0.12 * l : 0.4));

  const parts: string[] = [];
  for (const { x, y, lvl } of picked) {
    const dur = num(3.5 + rng() * 4.5);
    const delay = num(rng() * parseFloat(dur));
    parts.push(
      `<rect class="c ff f${lvl}" x="${ctx.px(x)}" y="${ctx.py(y)}" style="animation-duration:${dur}s;animation-delay:-${delay}s"/>`
    );
  }

  return { css, body: parts.join("\n    ") };
}

// ============================================================
// Scene: life — Conway's Game of Life (B3/S23, torus) seeded
// from the contribution graph itself; cells fade in when born
// and leave a brief afterglow when they die. The original graph
// is re-injected whenever the population dies out or stagnates
// ============================================================
function buildLife(ctx: SceneContext): SceneOutput {
  const { grid, colors, cycleSeconds, windowStart } = ctx;
  const W = grid.width;
  const H = grid.height;
  const size = W * H;
  const stepSec = 0.6;
  const riseSec = 0.22;
  const ghostSec = 0.12;
  const ghostOpacity = 0.3;
  const fadeSec = 0.55;
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

  // Per-cell opacity keyframes: a birth ramps up over riseSec, a death drops
  // to a ghost and then fades out. Every animated cell starts invisible.
  const values = new Map<number, string[]>();
  const keyTimes = new Map<number, string[]>();
  const pushKey = (idx: number, atSec: number, value: string) => {
    if (!values.has(idx)) {
      values.set(idx, ["0"]);
      keyTimes.set(idx, ["0"]);
    }
    values.get(idx)!.push(value);
    keyTimes.get(idx)!.push(frac(atSec, cycleSeconds));
  };
  const pushFlip = (idx: number, atSec: number, on: boolean) => {
    if (on) {
      pushKey(idx, atSec, "0");
      pushKey(idx, atSec + riseSec, "1");
    } else {
      pushKey(idx, atSec, "1");
      pushKey(idx, atSec + ghostSec, num(ghostOpacity));
      pushKey(idx, atSec + fadeSec, "0");
    }
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

  const parts: string[] = [];
  for (const [idx, vals] of values) {
    const x = Math.floor(idx / H);
    const y = idx % H;
    // Linear calcMode needs the list to end at keyTime 1; hold the last state
    const times = keyTimes.get(idx)!;
    const held = [...vals, vals[vals.length - 1]];
    parts.push(
      `<rect class="c" x="${ctx.px(x)}" y="${ctx.py(y)}" fill="${colors.life}" fill-opacity="0"><animate attributeName="fill-opacity" values="${held.join(";")}" keyTimes="${[...times, "1"].join(";")}" dur="${cycleSeconds}s" repeatCount="indefinite"/></rect>`
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
    `@keyframes fw{0%,100%{fill-opacity:0}1.5%{fill-opacity:var(--p)}8%{fill-opacity:var(--q)}26%{fill-opacity:0}}` +
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
// analyzer bar at its own pace, green at the bottom rising
// through teal and sky to violet; contribution level sets the
// brightness
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

  // Whole columns share duration + phase, so each bar moves as one
  const columnCss: string[] = [];
  const parts: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    const bounce = 1.6 + rng() * 1.4;
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
    levelCss("e", (l) => (l > 0 ? 0.5 + 0.12 * l : 0.42)) +
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
  { name: "tide", build: buildTide, dim: 0.35 },
  { name: "rain", build: buildRain, dim: 0.25 },
  { name: "fireflies", build: buildFireflies, dim: 0.35 },
  { name: "life", build: buildLife, dim: 0.55 },
  { name: "fireworks", build: buildFireworks, dim: 0.5 },
  { name: "equalizer", build: buildEqualizer, dim: 0.4 },
  { name: "comet", build: buildComet, dim: 0.5 },
];

/**
 * Opacity envelope for a window [t0, t1] on the master cycle: 0 → 1 over
 * `fadeIn`, 1 → 0 over `fadeOut`. The first window wraps around the cycle
 * end and the last window ends exactly at it, so neighbours crossfade.
 */
function windowPoints(
  fadeIn: [number, number],
  fadeOut: [number, number],
  cycle: number
): [number, number][] {
  if (fadeIn[0] <= 0) {
    return [[0, 1], [fadeOut[0], 1], [fadeOut[1], 0], [cycle + fadeIn[0], 0], [cycle, 1]];
  }
  if (fadeOut[1] >= cycle) {
    return [[0, 0], [fadeIn[0], 0], [fadeIn[1], 1], [Math.min(fadeOut[0], cycle), 1], [cycle, 0]];
  }
  return [[0, 0], [fadeIn[0], 0], [fadeIn[1], 1], [fadeOut[0], 1], [fadeOut[1], 0], [cycle, 0]];
}

/** One eased SMIL opacity animation from a piecewise-linear envelope */
function envelope(points: [number, number][], cycle: number): string {
  const values = points.map((p) => num(p[1])).join(";");
  const keyTimes = points.map((p) => frac(p[0], cycle)).join(";");
  const splines = points
    .slice(1)
    .map((p, i) => (p[1] === points[i][1] ? "0 0 1 1" : ".45 0 .25 1"))
    .join(";");
  return `<animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" keySplines="${splines}" calcMode="spline" dur="${cycle}s" repeatCount="indefinite"/>`;
}

/** Month labels above the columns where a new month begins */
function monthLabels(
  grid: Grid,
  cellX: (x: number) => number,
  y: number
): string {
  const starts = grid.weekStarts;
  if (!starts || starts.length !== grid.width) return "";
  const marks: { x: number; label: string }[] = [];
  let previous = -1;
  for (let x = 0; x < grid.width; x++) {
    const month = Number(starts[x]?.slice(5, 7));
    if (!MONTHS[month - 1]) continue;
    if (month !== previous) {
      marks.push({ x, label: MONTHS[month - 1] });
      previous = month;
    }
  }
  return marks
    .filter((m, i) => {
      const next = marks[i + 1];
      return (!next || next.x - m.x >= 3) && grid.width - m.x >= 3;
    })
    .map((m) => `<text class="month" x="${cellX(m.x)}" y="${y}">${m.label}</text>`)
    .join("");
}

function sceneTitle(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
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
  const { cellSize, cellGap, cellRadius } = config;
  const theme: GalleryTheme = galleryTheme(config.darkMode);
  // Keep the caller's contribution colors, while dimming scenes against the card surface.
  const palette = { ...config.palette, background: theme.background };
  const step = cellSize + cellGap;
  const svgWidth = grid.width * step - cellGap + MARGIN * 2;
  const svgHeight = grid.height * step - cellGap + MARGIN * 2;
  const graphWidth = svgWidth - MARGIN * 2;
  const graphHeight = svgHeight - MARGIN * 2;
  const scale = (svgWidth - 48) / graphWidth;
  const months = monthLabels(grid, (x) => Math.round((24 + x * step * scale) * 10) / 10, 86);
  const graphY = months ? 99 : 88;
  const cardHeight = Math.ceil(graphY + graphHeight * scale + 43);
  const footerY = cardHeight - 19;
  const colors = config.darkMode ? DARK_SCENE_COLORS : LIGHT_SCENE_COLORS;
  const cycleSeconds = SCENES.length * SCENE_SECONDS;
  const spectrum = config.darkMode ? ["#5eead4", "#7dd3fc", "#c4b5fd"] : ["#0d9488", "#2563eb", "#7c3aed"];
  // Light glows read as haze on a white card, so the bloom is tighter and fainter there
  const bloom = config.darkMode ? { blur: 4, alpha: 1.5, opacity: 0.7 } : { blur: 3, alpha: 1.2, opacity: 0.4 };

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

  // Static base: the real contribution graph, always visible underneath.
  // Columns reveal left to right once on load, then stay put.
  const baseRects: string[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      baseRects.push(
        `<rect class="c b i${x}" x="${px(x)}" y="${py(y)}" fill="${palette.contributionColors[lvl]}"/>`
      );
    }
  }
  const introCss = Array.from({ length: grid.width }, (_, x) => `.i${x}{animation-delay:${num(x * 0.02)}s}`).join("");

  const cssBlocks: string[] = [
    galleryCss(theme),
    `.c{width:${cellSize}px;height:${cellSize}px;rx:${cellRadius}px}` +
      `.b{animation:reveal .9s cubic-bezier(.2,.6,.2,1) both}` +
      `.ambient-scenes{animation:reveal 1.8s ease-out .5s both}` +
      `@keyframes reveal{from{opacity:0}}` +
      `.month{font-size:9.5px;letter-spacing:.3px;fill:${theme.muted};opacity:.9}` +
      `.scene-name{fill:${theme.muted}}` +
      introCss,
  ];

  const windows = ordered.map((_, i) => {
    const t0 = i * SCENE_SECONDS;
    const t1 = t0 + SCENE_SECONDS;
    return {
      scene: envelope(windowPoints([t0 - FADE_SECONDS, t0], [t1 - FADE_SECONDS, t1], cycleSeconds), cycleSeconds),
      label: envelope(windowPoints([t0 - LABEL_FADE, t0 + LABEL_FADE], [t1 - LABEL_FADE, t1 + LABEL_FADE], cycleSeconds), cycleSeconds),
    };
  });

  const veils: string[] = [];
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
    };
    const { css, body } = scene.build(ctx);
    if (css) cssBlocks.push(css);
    if (scene.dim > 0) {
      veils.push(
        `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${palette.background}" fill-opacity="${num(scene.dim)}" opacity="${i === 0 ? 1 : 0}">${windows[i].scene}</rect>`
      );
    }
    // First scene stays visible if SMIL is unsupported (static fallback)
    return `  <g data-scene="${scene.name}" opacity="${i === 0 ? 1 : 0}">
    ${windows[i].scene}
    ${body}
  </g>`;
  });

  // Caption: a pixel pager plus the scene name, both fading with the scene
  const dotPitch = 6.5;
  const dotY = footerY - 6.5;
  const nameX = svgWidth - 24;
  const dotsEnd = nameX - 60 - 12;
  const dotX = (i: number) => dotsEnd - (ordered.length - 1 - i) * dotPitch;
  const pager = ordered
    .map((_, i) => `<rect x="${num(dotX(i))}" y="${dotY}" width="3.5" height="3.5" rx=".9" fill="${theme.muted}" opacity=".28"/>`)
    .join("");
  const captions = ordered
    .map((scene, i) => `<g opacity="${i === 0 ? 1 : 0}">
      ${windows[i].label}
      <rect x="${num(dotX(i))}" y="${dotY}" width="3.5" height="3.5" rx=".9" fill="${theme.accent}"/>
      <text class="detail scene-name" x="${nameX}" y="${footerY}" text-anchor="end">${sceneTitle(scene.name)}</text>
    </g>`)
    .join("\n");
  cssBlocks.push(`.still-label{display:none}@media(prefers-reduced-motion:reduce){.ambient-scenes,.scene-labels{display:none}.still-label{display:inline}.c{animation:none!important}}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${cardHeight}" width="${svgWidth}" height="${cardHeight}" role="img" aria-labelledby="title description" data-design="gallery-v3">
  <title id="title">A year, in motion — contribution gallery</title>
  <desc id="description">Contribution graph ambient animation — ${ordered.map((s) => s.name).join(" → ")}, one scene every ${SCENE_SECONDS} seconds. Reduced motion shows the original contribution graph.</desc>
  <!-- generated by contribution-gallery ambient renderer (seed ${seed}) -->
  <style>${cssBlocks.join("\n")}</style>
  ${cardSurface(svgWidth, cardHeight, theme)}
  <defs>
    <linearGradient id="spectrum"><stop stop-color="${spectrum[0]}"/><stop offset=".5" stop-color="${spectrum[1]}"/><stop offset="1" stop-color="${spectrum[2]}"/></linearGradient>
    <radialGradient id="atmosphere" cx="80%" cy="0%" r="90%"><stop stop-color="${config.darkMode ? '#5865bc' : '#9db7ff'}" stop-opacity=".16"/><stop offset="1" stop-color="${theme.background}" stop-opacity="0"/>
      <animate attributeName="cx" values="80%;58%;80%" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" calcMode="spline" dur="46s" repeatCount="indefinite"/>
    </radialGradient>
    <filter id="bloom" x="-2%" y="-12%" width="104%" height="124%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="${bloom.blur}"/>
      <feComponentTransfer><feFuncA type="linear" slope="${bloom.alpha}"/></feComponentTransfer>
    </filter>
  </defs>
  <rect x="1" y="1" width="${svgWidth - 2}" height="${cardHeight - 2}" rx="14" fill="url(#atmosphere)"/>
  <text class="eyebrow" x="24" y="29">CONTRIBUTION GALLERY</text>
  <text class="heading" x="23" y="60" style="font-size:27px;letter-spacing:-.8px;fill:url(#spectrum)">A year, in motion.</text>
  <g class="motion">${pixelMark(svgWidth - 49, 30, theme)}</g>
  ${months}
  <g transform="translate(${24 - MARGIN * scale},${graphY - MARGIN * scale}) scale(${scale})">
    <g>${baseRects.join("\n    ")}</g>
    <g class="ambient-scenes">
    <g class="veils">${veils.join("\n    ")}</g>
    <use href="#scenes" filter="url(#bloom)" opacity="${num(bloom.opacity)}"/>
    <g id="scenes">${groups.join("\n")}</g>
    </g>
  </g>
  <text class="detail" x="24" y="${footerY}">${grid.width} weeks · A little, every day.</text>
  <g class="scene-labels">${pager}${captions}</g>
  <text class="detail still-label" x="${svgWidth - 24}" y="${footerY}" text-anchor="end">Contribution history</text>
</svg>
`;
}
