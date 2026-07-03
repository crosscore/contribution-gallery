import { UserStats } from "../types";

/**
 * Streak card renderer — the same design language as the ambient gallery:
 * rounded contribution cells, quiet CSS keyframe loops, GitHub palette.
 *
 * Layout (753x195, matching the ambient graph width):
 *   [ Total Contributions ] | [ pixel flame + Current Streak ] | [ Longest Streak ]
 * The separators are columns of seven cells (one per weekday row of the
 * graph) with a soft cascade; a few faint "firefly" cells drift along the
 * edges. The flame is pixel art built from the same rounded cells, and it
 * flickers via phase-shifted opacity keyframes.
 *
 * Served through GitHub's camo proxy inside an <img>: CSS/SMIL only.
 */

const WIDTH = 753;
const HEIGHT = 195;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Pixel flame, 7 wide x 8 tall: 1 = outer, 2 = core */
const FLAME = [
  "...1...",
  "..11...",
  "..111..",
  ".1111..",
  ".11211.",
  ".12221.",
  "1122211",
  ".12221.",
];

interface CardTheme {
  background: string;
  text: string;
  muted: string;
  separator: string;
  flameOuter: string;
  flameCore: string;
  totalGradient: [string, string];
  streakGradient: [string, string];
  longestGradient: [string, string];
  streakLabel: string;
  fireflies: [string, string, string];
}

const DARK_THEME: CardTheme = {
  background: "#010409",
  text: "#e6edf3",
  muted: "#8b949e",
  separator: "#58a6ff",
  flameOuter: "#fb923c",
  flameCore: "#fde047",
  totalGradient: ["#39d353", "#26a641"],
  streakGradient: ["#fde047", "#fb923c"],
  longestGradient: ["#c084fc", "#a78bfa"],
  streakLabel: "#fbbf24",
  fireflies: ["#2dd4bf", "#60a5fa", "#c084fc"],
};

const LIGHT_THEME: CardTheme = {
  background: "#ffffff",
  text: "#1f2328",
  muted: "#57606a",
  separator: "#0969da",
  flameOuter: "#ea580c",
  flameCore: "#eab308",
  totalGradient: ["#2da44e", "#1a7f37"],
  streakGradient: ["#d97706", "#ea580c"],
  longestGradient: ["#9333ea", "#7c3aed"],
  streakLabel: "#bc4c00",
  fireflies: ["#0d9488", "#2563eb", "#9333ea"],
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jun 21" or "Jun 21, 2024" */
function fmtDate(date: string, withYear: boolean): string {
  const [y, m, d] = date.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}${withYear ? `, ${y}` : ""}`;
}

/** Inclusive date range label; years shown only when needed */
function fmtRange(start: string, end: string, todayYear: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (sameYear && start.slice(0, 4) === todayYear) {
    return `${fmtDate(start, false)} – ${fmtDate(end, false)}`;
  }
  if (sameYear) {
    return `${fmtDate(start, false)} – ${fmtDate(end, true)}`;
  }
  return `${fmtDate(start, true)} – ${fmtDate(end, true)}`;
}

/** Render the streak card SVG */
export function renderStreakSVG(stats: UserStats, dark: boolean): string {
  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const todayYear = stats.generatedAt.slice(0, 4);
  const colX = [125.5, 376.5, 627.5];

  // --- pixel flame, centered in the middle column ---
  const cell = 7;
  const stepPx = 8;
  const flameX = colX[1] - (7 * stepPx - 1) / 2;
  const flameY = 15;
  const flameCells: string[] = [];
  let flameIndex = 0;
  for (let row = 0; row < FLAME.length; row++) {
    for (let col = 0; col < 7; col++) {
      const kind = FLAME[row][col];
      if (kind === ".") continue;
      const fill = kind === "2" ? theme.flameCore : theme.flameOuter;
      const tip = row <= 2 ? " ft" : "";
      flameCells.push(
        `<rect class="fc fl p${flameIndex % 3}${tip}" x="${flameX + col * stepPx}" y="${flameY + row * stepPx}" fill="${fill}"/>`
      );
      flameIndex++;
    }
  }

  // --- separators: 7 cells per column (one per weekday row), soft cascade ---
  const sepCells: string[] = [];
  for (const sx of [248, 499]) {
    for (let row = 0; row < 7; row++) {
      sepCells.push(
        `<rect class="sp" x="${sx}" y="${67 + row * 9}" fill="${theme.separator}" style="animation-delay:${(row * 0.22).toFixed(2)}s"/>`
      );
    }
  }

  // --- faint fireflies along the edges (fixed, deliberately sparse) ---
  const fireflySpots: [number, number][] = [
    [26, 18], [66, 170], [174, 22], [228, 168], [302, 20],
    [452, 22], [522, 170], [608, 18], [700, 168], [728, 62],
  ];
  const fireflies = fireflySpots
    .map(([x, y], i) => {
      const color = theme.fireflies[i % 3];
      const dur = (4.5 + (i % 5) * 0.6).toFixed(1);
      const delay = (-(i * 1.3) % 7).toFixed(1);
      const peak = (0.1 + (i % 3) * 0.03).toFixed(2);
      return `<rect class="fc gl" x="${x}" y="${y}" fill="${color}" style="animation-duration:${dur}s;animation-delay:${delay}s;--m:${peak}"/>`;
    })
    .join("\n    ");

  // --- three stat columns ---
  const total = stats.totalContributions.toLocaleString("en-US");
  const current = stats.currentStreak.days.toLocaleString("en-US");
  const longest = stats.longestStreak.days.toLocaleString("en-US");
  const totalRange = `${fmtDate(stats.firstContribution, true)} – Present`;
  const currentRange =
    stats.currentStreak.days > 0
      ? fmtRange(stats.currentStreak.start, stats.currentStreak.end, todayYear)
      : "—";
  const longestRange =
    stats.longestStreak.days > 0
      ? fmtRange(stats.longestStreak.start, stats.longestStreak.end, todayYear)
      : "—";

  const css = [
    `text{font-family:${FONT}}`,
    `.fc{width:${cell}px;height:${cell}px;rx:2px}`,
    `.sp{width:6px;height:6px;rx:1.5px;fill-opacity:.12;animation:sp 2.6s ease-in-out infinite}`,
    `@keyframes sp{0%,100%{fill-opacity:.12}45%{fill-opacity:.55}}`,
    `.fl{animation:fl 1.35s ease-in-out infinite}`,
    `.ft{animation-duration:.95s}`,
    `@keyframes fl{0%,100%{fill-opacity:1}50%{fill-opacity:.5}}`,
    `.p0{animation-delay:0s}.p1{animation-delay:-.45s}.p2{animation-delay:-.9s}`,
    `.gl{fill-opacity:.04;animation:gl 5s ease-in-out infinite}`,
    `@keyframes gl{0%,100%{fill-opacity:.04}50%{fill-opacity:var(--m)}}`,
    `.num{font-size:34px;font-weight:700}`,
    `.big{font-size:44px;font-weight:800;animation:br 3.2s ease-in-out infinite}`,
    `@keyframes br{0%,100%{opacity:1}50%{opacity:.82}}`,
    `.lbl{font-size:13px;font-weight:600;fill:${theme.muted}}`,
    `.sub{font-size:11px;fill:${theme.muted}}`,
  ].join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="GitHub streak: ${stats.currentStreak.days} day current streak">
  <title>GitHub streak — ${total} total contributions, current streak ${current} days, longest ${longest} days</title>
  <defs>
    <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.totalGradient[0]}"/><stop offset="1" stop-color="${theme.totalGradient[1]}"/>
    </linearGradient>
    <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.streakGradient[0]}"/><stop offset="1" stop-color="${theme.streakGradient[1]}"/>
    </linearGradient>
    <linearGradient id="gl2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.longestGradient[0]}"/><stop offset="1" stop-color="${theme.longestGradient[1]}"/>
    </linearGradient>
  </defs>
  <style>${css}</style>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${theme.background}" rx="6"/>
  <g>
    ${fireflies}
  </g>
  <g>
    ${sepCells.join("\n    ")}
  </g>
  <g text-anchor="middle">
    <text class="num" x="${colX[0]}" y="98" fill="url(#gt)">${total}</text>
    <text class="lbl" x="${colX[0]}" y="126">Total Contributions</text>
    <text class="sub" x="${colX[0]}" y="146">${totalRange}</text>
  </g>
  <g>
    ${flameCells.join("\n    ")}
  </g>
  <g text-anchor="middle">
    <text class="big" x="${colX[1]}" y="126" fill="url(#gs)">${current}</text>
    <text class="lbl" x="${colX[1]}" y="152" fill="${theme.streakLabel}">Current Streak</text>
    <text class="sub" x="${colX[1]}" y="172">${currentRange}</text>
  </g>
  <g text-anchor="middle">
    <text class="num" x="${colX[2]}" y="98" fill="url(#gl2)">${longest}</text>
    <text class="lbl" x="${colX[2]}" y="126">Longest Streak</text>
    <text class="sub" x="${colX[2]}" y="146">${longestRange}</text>
  </g>
</svg>
`;
}
