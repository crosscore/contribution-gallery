import { UserStats } from "../types";

/**
 * Stats card renderer — the ambient design language on a compact 375x195
 * panel. Five stat rows, each with a tiny pixel icon built from rounded
 * cells (diamond commit, star, merging pull request, issue ring, person),
 * shimmering via the phase-shifted opacity trick the flame uses. Values
 * carry per-stat vertical gradients; a small contribution-palette strip
 * cascades in the header and a few faint fireflies drift along the edges.
 *
 * Designed to sit side by side with the langs card: 375 + gap + 375 ≈ 753,
 * the ambient graph width. Served through GitHub's camo proxy inside an
 * <img>: CSS/SMIL only.
 */

const WIDTH = 375;
const HEIGHT = 195;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** 5x5 pixel icons drawn with rounded cells */
const ICONS: Record<string, string[]> = {
  commit: [
    "..1..",
    ".111.",
    "11111",
    ".111.",
    "..1..",
  ],
  star: [
    "..1..",
    ".111.",
    "11111",
    ".111.",
    "11.11",
  ],
  pr: [
    "1...1",
    "1...1",
    "1...1",
    ".1.1.",
    "..1..",
  ],
  issue: [
    ".111.",
    "1...1",
    "1.1.1",
    "1...1",
    ".111.",
  ],
  person: [
    ".111.",
    ".111.",
    ".....",
    "11111",
    "11111",
  ],
};

interface RowTheme {
  icon: string;
  gradient: [string, string];
}

interface StatsTheme {
  background: string;
  text: string;
  muted: string;
  /** Contribution palette ramp for the header strip (level 0-4) */
  strip: [string, string, string, string, string];
  fireflies: [string, string, string];
  commits: RowTheme;
  stars: RowTheme;
  prs: RowTheme;
  issues: RowTheme;
  followers: RowTheme;
}

const DARK_THEME: StatsTheme = {
  background: "#010409",
  text: "#e6edf3",
  muted: "#8b949e",
  strip: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  fireflies: ["#2dd4bf", "#60a5fa", "#c084fc"],
  commits: { icon: "#39d353", gradient: ["#39d353", "#26a641"] },
  stars: { icon: "#fbbf24", gradient: ["#fde047", "#fbbf24"] },
  prs: { icon: "#a78bfa", gradient: ["#c084fc", "#a78bfa"] },
  issues: { icon: "#38bdf8", gradient: ["#7dd3fc", "#38bdf8"] },
  followers: { icon: "#f472b6", gradient: ["#f9a8d4", "#f472b6"] },
};

const LIGHT_THEME: StatsTheme = {
  background: "#ffffff",
  text: "#1f2328",
  muted: "#57606a",
  strip: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  fireflies: ["#0d9488", "#2563eb", "#9333ea"],
  commits: { icon: "#1a7f37", gradient: ["#2da44e", "#1a7f37"] },
  stars: { icon: "#b45309", gradient: ["#d97706", "#b45309"] },
  prs: { icon: "#6639ba", gradient: ["#9333ea", "#6639ba"] },
  issues: { icon: "#0969da", gradient: ["#0969da", "#0550ae"] },
  followers: { icon: "#bf3989", gradient: ["#db2777", "#bf3989"] },
};

/** Render the stats card SVG */
export function renderStatsSVG(stats: UserStats, dark: boolean): string {
  const theme = dark ? DARK_THEME : LIGHT_THEME;

  const rows = [
    { icon: ICONS.commit, label: "Total Commits", value: stats.commits, row: theme.commits },
    { icon: ICONS.star, label: "Total Stars", value: stats.stars, row: theme.stars },
    { icon: ICONS.pr, label: "Pull Requests", value: stats.pullRequests, row: theme.prs },
    { icon: ICONS.issue, label: "Issues", value: stats.issues, row: theme.issues },
    { icon: ICONS.person, label: "Followers", value: stats.followers, row: theme.followers },
  ];

  const gradients = rows
    .map(
      (r, i) => `    <linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${r.row.gradient[0]}"/><stop offset="1" stop-color="${r.row.gradient[1]}"/>
    </linearGradient>`
    )
    .join("\n");

  // --- stat rows: pixel icon + label + gradient value ---
  const stepPx = 4; // 3px cell + 1px gap
  const body = rows
    .map((r, i) => {
      const rowY = 62 + i * 25;
      const iconY = rowY - 14;
      const cells: string[] = [];
      let cellIndex = 0;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          if (r.icon[row][col] === ".") continue;
          cells.push(
            `<rect class="ic tw p${cellIndex % 3}" x="${24 + col * stepPx}" y="${iconY + row * stepPx}" fill="${r.row.icon}"/>`
          );
          cellIndex++;
        }
      }
      return `  <g>
    ${cells.join("\n    ")}
    <text class="lbl" x="54" y="${rowY}">${r.label}</text>
    <text class="val" x="353" y="${rowY}" text-anchor="end" fill="url(#g${i})" style="animation-delay:${(i * 0.4).toFixed(1)}s">${r.value.toLocaleString("en-US")}</text>
  </g>`;
    })
    .join("\n");

  // --- header strip: the contribution palette ramp, cascading ---
  const strip = theme.strip
    .map(
      (color, i) =>
        `<rect class="hs" x="${309 + i * 9}" y="20" fill="${color}" style="animation-delay:${(i * 0.18).toFixed(2)}s"/>`
    )
    .join("\n    ");

  // --- faint fireflies along the edges ---
  const fireflySpots: [number, number][] = [
    [12, 108], [360, 62], [200, 182],
  ];
  const fireflies = fireflySpots
    .map(([x, y], i) => {
      const color = theme.fireflies[i % 3];
      const dur = (4.5 + i * 0.7).toFixed(1);
      const delay = (-(i * 1.7)).toFixed(1);
      const peak = (0.1 + i * 0.03).toFixed(2);
      return `<rect class="ff gl" x="${x}" y="${y}" fill="${color}" style="animation-duration:${dur}s;animation-delay:${delay}s;--m:${peak}"/>`;
    })
    .join("\n    ");

  const css = [
    `text{font-family:${FONT}}`,
    `.ic{width:3px;height:3px;rx:.9px}`,
    `.hs{width:7px;height:7px;rx:2px;animation:hs 2.6s ease-in-out infinite}`,
    `@keyframes hs{0%,100%{fill-opacity:.45}45%{fill-opacity:1}}`,
    `.tw{animation:tw 2.4s ease-in-out infinite}`,
    `@keyframes tw{0%,100%{fill-opacity:1}50%{fill-opacity:.45}}`,
    `.p0{animation-delay:0s}.p1{animation-delay:-.8s}.p2{animation-delay:-1.6s}`,
    `.ff{width:6px;height:6px;rx:1.5px}`,
    `.gl{fill-opacity:.04;animation:gl 5s ease-in-out infinite}`,
    `@keyframes gl{0%,100%{fill-opacity:.04}50%{fill-opacity:var(--m)}}`,
    `.ttl{font-size:14px;font-weight:700;fill:${theme.text}}`,
    `.lbl{font-size:12.5px;font-weight:600;fill:${theme.muted}}`,
    `.val{font-size:15.5px;font-weight:700;animation:br 3.2s ease-in-out infinite}`,
    `@keyframes br{0%,100%{opacity:1}50%{opacity:.82}}`,
  ].join("\n");

  const summary = rows
    .map((r) => `${r.value.toLocaleString("en-US")} ${r.label.toLowerCase()}`)
    .join(", ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="GitHub stats">
  <title>GitHub stats — ${summary}</title>
  <defs>
${gradients}
  </defs>
  <style>${css}</style>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${theme.background}" rx="6"/>
  <g>
    ${fireflies}
  </g>
  <text class="ttl" x="22" y="33">GitHub Stats</text>
  <g>
    ${strip}
  </g>
${body}
</svg>
`;
}
