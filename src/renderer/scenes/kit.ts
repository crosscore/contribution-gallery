import { Grid } from "../../types";

/**
 * Shared toolkit for ambient scenes.
 *
 * Every scene paints on the same 53 × 7 cell lattice and plays inside a
 * fixed window of the master cycle. Continuous scenes are CSS keyframe
 * loops where each cell only carries a phase offset; story scenes (a maze
 * being solved, bars being sorted, a rally of Pong) run a one-shot script
 * inside their window and rest in an invisible state everywhere else, so
 * the crossfade into the window always starts from the story's first frame.
 */

export const SCENE_SECONDS = 15;

/** One harmonious set of hues per theme; every scene draws from it. */
export interface Spectrum {
  mint: string;
  emerald: string;
  lime: string;
  sky: string;
  indigo: string;
  violet: string;
  pink: string;
  rose: string;
  amber: string;
  /** The brightest highlight: near-white on dark, near-ink on light */
  glint: string;
  /** Tide rows, sea floor → crest */
  tide: string[];
}

export const DARK_SPECTRUM: Spectrum = {
  mint: "#5eead4",
  emerald: "#34d399",
  lime: "#a3e635",
  sky: "#7dd3fc",
  indigo: "#a5b4fc",
  violet: "#c4b5fd",
  pink: "#f9a8d4",
  rose: "#fb7185",
  amber: "#fcd34d",
  glint: "#f5fffb",
  tide: ["#0f766e", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4", "#ccfbf1", "#f0fdfa"],
};

export const LIGHT_SPECTRUM: Spectrum = {
  mint: "#0d9488",
  emerald: "#059669",
  lime: "#4d7c0f",
  sky: "#0284c7",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  pink: "#db2777",
  rose: "#e11d48",
  amber: "#d97706",
  glint: "#0f172a",
  tide: ["#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59"],
};

export type Hue = Exclude<keyof Spectrum, "tide" | "glint">;

export interface SceneContext {
  grid: Grid;
  dark: boolean;
  colors: Spectrum;
  rng: () => number;
  /** Pixel position of a cell's top-left corner */
  px: (x: number) => number;
  py: (y: number) => number;
  /** Cell size and pitch in pixels */
  cell: number;
  step: number;
  radius: number;
  /** Master cycle length in seconds */
  cycle: number;
  /** Absolute start time (s) of this scene's window on the master cycle */
  start: number;
  /** Id of a mask that keeps only the cell squares of the lattice */
  cellMask: string;
}

export interface SceneOutput {
  /** CSS rules (keyframes + shared classes) for this scene */
  css: string;
  /** SVG elements inside the scene group */
  body: string;
}

export interface Scene {
  id: string;
  title: string;
  /** One line for the gallery placard */
  caption: string;
  /** Signature hue for the caption and the progress segment */
  hue: Hue;
  /** How much to veil the base graph while this scene plays */
  dim: number;
  build: (ctx: SceneContext) => SceneOutput;
}

/** Deterministic PRNG so output is reproducible for a given seed */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Trim needless zeros: 0.50 -> .5, 3.00 -> 3 */
export function num(n: number): string {
  return parseFloat(n.toFixed(2)).toString().replace(/^(-?)0\./, "$1.");
}

/** Fraction of the master cycle, formatted for SMIL keyTimes */
export function frac(seconds: number, cycle: number): string {
  return Math.min(Math.max(seconds / cycle, 0), 1).toFixed(5);
}

/** Linear mix of two #rrggbb colors */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  return "#" + [16, 8, 0].map((s) => {
    const ca = (pa >> s) & 255;
    const cb = (pb >> s) & 255;
    return Math.round(ca + (cb - ca) * t).toString(16).padStart(2, "0");
  }).join("");
}

/** Sample a multi-stop gradient at t ∈ [0, 1] */
export function ramp(stops: string[], t: number): string {
  const u = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(u), stops.length - 2);
  return mix(stops[i], stops[i + 1], u - i);
}

/** Cell classes carrying the peak (--p) and trough (--q) opacity per contribution level */
export function levelCss(prefix: string, peak: (level: number) => number, troughRatio = 0): string {
  return [0, 1, 2, 3, 4]
    .map((l) => `.${prefix}${l}{--p:${num(peak(l))}${troughRatio ? `;--q:${num(peak(l) * troughRatio)}` : ""}}`)
    .join("");
}

/**
 * CSS keyframes for a one-shot story inside the scene window.
 *
 * `stops` are [seconds after the window opens, declarations]. Outside the
 * window the element rests at `rest`, so an element may shift its copy of
 * the story later with a positive animation-delay (shorter than a window)
 * and still enter and leave the window in its resting state.
 */
export function storyKeyframes(
  name: string,
  stops: [number, string][],
  rest: string,
  ctx: Pick<SceneContext, "start" | "cycle">
): string {
  const at = (s: number) => `${Math.min(Math.max(((ctx.start + s) / ctx.cycle) * 100, 0), 100).toFixed(3)}%`;
  const end = ctx.start + SCENE_SECONDS;
  const frames: string[] = [`0%{${rest}}`];
  if (ctx.start > 0) frames.push(`${at(0)}{${rest}}`);
  for (const [s, decl] of stops) frames.push(`${at(s)}{${decl}}`);
  // Hold the final state to the end of the window, then drop back to rest;
  // the last window holds through 100% so the loop never eases toward rest
  const last = stops[stops.length - 1][1];
  if (end < ctx.cycle) {
    frames.push(`${at(SCENE_SECONDS)}{${last}}`);
    frames.push(`${(((end + 0.01) / ctx.cycle) * 100).toFixed(3)}%{${rest}}`);
    frames.push(`100%{${rest}}`);
  } else {
    frames.push(`100%{${last}}`);
  }
  return `@keyframes ${name}{${frames.join("")}}`;
}

/** Shorthand for an element that follows a story keyframe over the master cycle */
export function storyAnimation(name: string, ctx: Pick<SceneContext, "cycle">): string {
  return `animation:${name} ${ctx.cycle}s linear infinite`;
}

/**
 * A linear SMIL tween for one attribute over the scene window: `stops` are
 * [seconds after the window opens, value]. Before the window the attribute
 * rests at `rest`; it holds the last value to the end of the window and
 * snaps back to rest right after.
 */
export function storyTween(
  attribute: string,
  rest: string,
  stops: [number, string][],
  ctx: Pick<SceneContext, "start" | "cycle">
): string {
  const points: [number, string][] = [[0, rest]];
  if (ctx.start > 0) points.push([ctx.start, rest]);
  for (const [s, v] of stops) points.push([ctx.start + s, v]);
  const end = ctx.start + SCENE_SECONDS;
  const last = stops[stops.length - 1][1];
  if (end < ctx.cycle) points.push([end, last], [end + 0.01, rest], [ctx.cycle, rest]);
  else points.push([ctx.cycle, last]);
  const values = points.map((p) => p[1]).join(";");
  const keyTimes = points.map((p) => frac(p[0], ctx.cycle)).join(";");
  return `<animate attributeName="${attribute}" values="${values}" keyTimes="${keyTimes}" dur="${ctx.cycle}s" repeatCount="indefinite"/>`;
}

/**
 * A discrete SMIL timeline for one attribute. `events` are [seconds after
 * the window opens, value]; outside the window the attribute rests at
 * `rest`. Consecutive duplicates are dropped to keep the markup small.
 */
export function discreteTimeline(
  attribute: string,
  rest: string,
  events: [number, string][],
  ctx: Pick<SceneContext, "start" | "cycle">,
  begin = 0
): string {
  const values: string[] = [rest];
  const times: string[] = ["0"];
  const push = (atSec: number, value: string) => {
    if (value === values[values.length - 1]) return;
    const t = frac(atSec, ctx.cycle);
    if (t === times[times.length - 1]) {
      values[values.length - 1] = value;
      return;
    }
    values.push(value);
    times.push(t);
  };
  for (const [s, v] of events) push(ctx.start + s, v);
  if (ctx.start + SCENE_SECONDS < ctx.cycle) push(ctx.start + SCENE_SECONDS, rest);
  if (values.length === 1) return "";
  return `<animate attributeName="${attribute}" values="${values.join(";")}" keyTimes="${times.join(";")}" calcMode="discrete" dur="${ctx.cycle}s"${begin ? ` begin="${num(begin)}s"` : ""} repeatCount="indefinite"/>`;
}
