import { CellOwner, Grid, DEFAULT_RENDER_CONFIG, DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE } from "../../types";
import { renderAmbientSVG } from "../ambient";
import { mulberry32, SCENE_SECONDS } from "./kit";

const CYCLE = 9 * SCENE_SECONDS;
const SEEDS = [1, 2, 3, 5, 8, 13];

/** A skewed random year: mostly quiet days with a few busy ones */
const makeGrid = (seed: number): Grid => {
  const rng = mulberry32(seed);
  return { width: 53, height: 7, cells: Array.from({ length: 53 }, (_, x) =>
    Array.from({ length: 7 }, (_, y) => ({ x, y, contributionLevel: Math.floor(rng() ** 2 * 5) as 0 | 1 | 2 | 3 | 4, owner: CellOwner.None }))) };
};

const render = (seed: number, dark = true) => renderAmbientSVG(makeGrid(seed),
  { ...DEFAULT_RENDER_CONFIG, darkMode: dark, palette: dark ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE }, seed);

/** Each scene group sits on its own line inside #scenes, in playing order */
const scenes = (svg: string) => [...svg.matchAll(/<g data-scene="([^"]+)".*$/gm)].map((m, i) => ({ id: m[1], start: i * SCENE_SECONDS, markup: m[0] }));
const scene = (svg: string, id: string) => scenes(svg).find((s) => s.id === id)!;

const timelines = (markup: string) => [...markup.matchAll(/<animate(?:Transform)? attributeName="([^"]+)"[^>]*? values="([^"]*)" keyTimes="([^"]*)"([^>]*)/g)]
  .map((m) => ({ attribute: m[1], values: m[2].split(";"), times: m[3].split(";").map(Number), discrete: m[4].includes('calcMode="discrete"') }));

/** The value a discrete timeline shows at an absolute time on the cycle */
const discreteAt = (values: string[], times: number[], seconds: number) =>
  values[times.filter((t) => t <= seconds / CYCLE + 1e-9).length - 1];

test.each(SEEDS)("every scene timeline is well formed and loops back to its resting frame (seed %i)", (seed) => {
  for (const dark of [true, false]) {
    const svg = render(seed, dark);
    const all = scenes(svg);
    expect(all).toHaveLength(9);
    for (const { markup, start } of all) {
      for (const { values, times, discrete } of timelines(markup)) {
        expect(values).toHaveLength(times.length);
        expect(times[0]).toBe(0);
        // Interpolated timelines must end at 1; a discrete one holds its last value
        if (discrete) expect(times[times.length - 1]).toBeLessThanOrEqual(1);
        else expect(times[times.length - 1]).toBe(1);
        times.slice(1).forEach((t, i) => expect(t).toBeGreaterThanOrEqual(times[i]));
        // Stories rest outside their window, so the wrap into window 0 is seamless;
        // only the final window may hold its last frame until the cycle ends
        if (start + SCENE_SECONDS < CYCLE) expect(values[values.length - 1]).toBe(values[0]);
      }
    }
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  }
});

test.each(SEEDS)("sort settles into a rising staircase before its window closes (seed %i)", (seed) => {
  const { markup, start } = scene(render(seed), "sort");
  const bars = [...markup.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="\d+" height="\d+">(.*?)<\/rect>/g)].map((m) => {
    const [timeline] = timelines(m[3]);
    const top = timeline ? discreteAt(timeline.values, timeline.times, start + SCENE_SECONDS - 0.5) : m[2];
    return { x: Number(m[1]), top: Number(top) };
  }).sort((a, b) => a.x - b.x);
  expect(bars).toHaveLength(53);
  bars.slice(1).forEach((bar, i) => expect(bar.top).toBeLessThanOrEqual(bars[i].top));
  expect(bars[52].top).toBeLessThan(bars[0].top);
});

test.each(SEEDS)("pathfinder traces one connected route from the first week to the latest (seed %i)", (seed) => {
  const { markup } = scene(render(seed), "pathfinder");
  const route = [...markup.matchAll(/class="c pt" x="(\d+)" y="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  // Traced from the goal back to the start, one neighbouring cell at a time
  expect(route[0]).toEqual([7 + 52 * 14, 7 + 6 * 14]);
  expect(route[route.length - 1]).toEqual([7, 7]);
  expect(route.length).toBeGreaterThanOrEqual(52 + 6 + 1);
  route.slice(1).forEach(([x, y], i) => expect(Math.abs(x - route[i][0]) + Math.abs(y - route[i][1])).toBe(14));
});

test.each(SEEDS)("every pong window puts at least one point on the scoreboard (seed %i)", (seed) => {
  const { markup } = scene(render(seed), "pong");
  const goals = timelines(markup).filter((t) => t.attribute === "opacity" && t.values.includes(".9"));
  expect(goals.length).toBeGreaterThanOrEqual(1);
  expect(markup).toMatch(/class="c pg-score"[^>]*><animate attributeName="fill-opacity"/);
});
