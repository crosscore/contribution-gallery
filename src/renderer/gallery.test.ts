import { CellOwner, Grid, UserStats, DEFAULT_RENDER_CONFIG, DEFAULT_DARK_PALETTE } from "../types";
import { renderAmbientSVG } from "./ambient";
import { renderStatsSVG } from "./stats";
import { renderLangsSVG } from "./langs";
import { renderStreakSVG } from "./streak";
import { renderTrophySVG } from "./trophy";

const stats: UserStats = {
  login: "test", generatedAt: "2026-09-07T00:00:00Z", totalContributions: 12345,
  firstContribution: "2020-01-01", commits: 4000, followers: 0, stars: 200,
  repos: 30, pullRequests: 1000, issues: 40, reviews: 8,
  currentStreak: { days: 285, start: "2025-11-26", end: "2026-09-06" },
  longestStreak: { days: 285, start: "2025-11-26", end: "2026-09-06" },
  languages: [{ name: "C++", color: "#f34b7d", size: 3 }, { name: "C", color: "#555555", size: 1 }],
};

test.each([false, true])("cards retain data, accessible descriptions and valid numeric output (dark=%s)", dark => {
  for (const render of [renderStatsSVG, renderLangsSVG, renderStreakSVG, renderTrophySVG]) {
    const svg = render(stats, dark);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<desc id="description">');
    expect(svg).toContain('prefers-reduced-motion');
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//);
  }
  expect(renderStatsSVG(stats, dark)).toContain("4,000");
  expect(renderStreakSVG(stats, dark)).toContain("12,345");
});

test("language proportions stay linear and empty data never divides by zero", () => {
  const svg = renderLangsSVG(stats, true);
  expect(svg).toContain("75.0%");
  // Leading language fills 26 cells; one-third as much code fills 9 cells.
  expect(svg.match(/class="language-cell"/g)).toHaveLength(35);
  for (const languages of [[], [{ name: "Empty", size: 0, color: null }]]) {
    const empty = renderLangsSVG({ ...stats, languages }, true);
    expect(empty).toContain("No language data yet");
    expect(empty).not.toMatch(/NaN|Infinity/);
  }
});

test("external language names and profile names are XML escaped", () => {
  const custom = { ...stats, login: 'user<&"', languages: [{ name: 'A<&"', color: null, size: 1 }] };
  expect(renderLangsSVG(custom, true)).toContain("A&lt;&amp;&quot;");
  expect(renderStatsSVG(custom, true)).toContain("user&lt;&amp;&quot;");
});

test("streak date ranges retain both years and an inactive streak does not animate a flame", () => {
  expect(renderStreakSVG(stats, true)).toContain("Nov 26, 2025 – Sep 6, 2026");
  const inactive = renderStreakSVG({ ...stats, currentStreak: { days: 0, start: "", end: "" } }, true);
  expect(inactive).toContain("A fresh start awaits");
  expect(inactive).not.toContain('class="flame-cell"');
});

test("milestones preserve rank boundaries and unranked values", () => {
  const svg = renderTrophySVG(stats, true);
  expect(svg).toContain("Commits: 4,000, rank SSS");
  expect(svg).toContain("Followers: 0, rank unranked");
  expect(svg).toContain("Stars: 200, rank S");
  expect(renderTrophySVG({ ...stats, commits: 3999 }, true)).toContain("Commits: 3,999, rank SS");
});

test("ambient preserves all nine scenes and the original grid as its reduced-motion fallback", () => {
  const grid: Grid = { width: 53, height: 7, cells: Array.from({ length: 53 }, (_, x) =>
    Array.from({ length: 7 }, (_, y) => ({ x, y, contributionLevel: 0, owner: CellOwner.None }))) };
  const config = { ...DEFAULT_RENDER_CONFIG, darkMode: true, palette: DEFAULT_DARK_PALETTE };
  const svg = renderAmbientSVG(grid, config, 42);
  expect(svg).toBe(renderAmbientSVG(grid, config, 42));
  expect(svg).not.toBe(renderAmbientSVG(grid, config, 43));
  expect(new Set([...svg.matchAll(/data-scene="([^"]+)"/g)].map(m => m[1])).size).toBe(9);
  expect(svg).toContain('data-scene="tide"');
  // The real graph stays underneath every scene, and is all that remains without motion
  expect(svg.match(/class="c b i\d+" /g)).toHaveLength(371);
  expect(svg).toContain('.ambient-scenes,.scene-labels{display:none}');
  expect(svg).toContain('<use href="#scenes" filter="url(#bloom)"');
  expect(svg).toContain('width="753"');
  expect(svg).not.toContain('class="month"');
  expect(svg).not.toMatch(/NaN|Infinity/);
});

test("ambient labels the months when the grid carries week dates", () => {
  const weekStarts = Array.from({ length: 53 }, (_, x) =>
    new Date(Date.UTC(2025, 8, 7) + x * 7 * 86_400_000).toISOString().slice(0, 10));
  const grid: Grid = { width: 53, height: 7, weekStarts, cells: Array.from({ length: 53 }, (_, x) =>
    Array.from({ length: 7 }, (_, y) => ({ x, y, contributionLevel: (x % 5) as 0 | 1 | 2 | 3 | 4, owner: CellOwner.None }))) };
  const svg = renderAmbientSVG(grid, DEFAULT_RENDER_CONFIG, 7);
  const months = [...svg.matchAll(/class="month" x="[\d.]+" y="\d+">(\w+)</g)].map(m => m[1]);
  expect(months).toEqual(["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"]);
  // Life cells ramp between states instead of flipping, with a linear key list ending at 1
  expect(svg).toMatch(/values="0;0;1;[^"]*" keyTimes="0;0\.\d+;0\.\d+;[^"]*;1" dur="135s"/);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);
});
