import { UserStats } from "../types";

/**
 * Trophy card renderer — seven achievement badges in the ambient design
 * language. Each badge is a giant rounded "contribution cell" panel holding
 * a pixel-art trophy built from small cells, tinted by rank: a cup with
 * side handles, a stem and a two-step base. Below the trophy the badge
 * stacks rank → category → value on one centered axis. A soft white glint
 * sweeps diagonally across the trophy pixels, staggered per badge (the
 * same per-cell phase trick the ambient scenes use), and S-tier badges
 * earn a pair of twinkling sparkles.
 *
 * Ranks follow the familiar SSS…C ladder. Served through GitHub's camo
 * proxy inside an <img>: CSS/SMIL only.
 */

const BADGE = 105;
const GAP = 3;
const WIDTH = 7 * BADGE + 6 * GAP; // 753, same as the ambient graph
const HEIGHT = BADGE;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Pixel trophy, 9 wide x 7 tall: 1 = cup, 2 = handles (dimmed) */
const TROPHY = [
  ".1111111.",
  "2.11111.2",
  ".2111112.",
  "..11111..",
  "....1....",
  "...111...",
  "..11111..",
];

const RANKS = ["SSS", "SS", "S", "AAA", "AA", "A", "B", "C"] as const;

interface TrophyTheme {
  panel: string;
  text: string;
  muted: string;
  glint: string;
  /** Twinkle color for the S-tier sparkles */
  sparkle: string;
  /** Rank tier colors: S tier (SSS/SS/S), A tier (AAA/AA/A), B, C, unranked */
  tierS: string;
  tierA: string;
  tierB: string;
  tierC: string;
  none: string;
}

const DARK_THEME: TrophyTheme = {
  panel: "#161b22",
  text: "#e6edf3",
  muted: "#8b949e",
  glint: "#ffffff",
  sparkle: "#fde68a",
  tierS: "#fbbf24",
  tierA: "#a78bfa",
  tierB: "#38bdf8",
  tierC: "#4ade80",
  none: "#6e7681",
};

const LIGHT_THEME: TrophyTheme = {
  panel: "#ebedf0",
  text: "#1f2328",
  muted: "#57606a",
  glint: "#ffffff",
  sparkle: "#f59e0b",
  tierS: "#b45309",
  tierA: "#6639ba",
  tierB: "#0969da",
  tierC: "#1a7f37",
  none: "#6e7681",
};

interface Category {
  title: string;
  value: number;
  /** Thresholds for SSS, SS, S, AAA, AA, A, B, C */
  thresholds: [number, number, number, number, number, number, number, number];
}

function categories(stats: UserStats): Category[] {
  return [
    { title: "COMMITS", value: stats.commits, thresholds: [4000, 2000, 1000, 500, 200, 100, 50, 1] },
    { title: "FOLLOWERS", value: stats.followers, thresholds: [800, 400, 200, 100, 50, 25, 10, 1] },
    { title: "STARS", value: stats.stars, thresholds: [2000, 700, 200, 100, 50, 30, 10, 1] },
    { title: "REPOS", value: stats.repos, thresholds: [150, 100, 50, 30, 20, 10, 5, 1] },
    { title: "PULL REQS", value: stats.pullRequests, thresholds: [1000, 500, 200, 100, 50, 25, 10, 1] },
    { title: "ISSUES", value: stats.issues, thresholds: [500, 300, 150, 80, 40, 20, 8, 1] },
    { title: "REVIEWS", value: stats.reviews, thresholds: [500, 300, 150, 80, 40, 20, 8, 1] },
  ];
}

/** Rank index into RANKS, or -1 when unranked */
function rankIndex(category: Category): number {
  return category.thresholds.findIndex((t) => category.value >= t);
}

function rankColor(index: number, theme: TrophyTheme): string {
  if (index < 0) return theme.none;
  if (index <= 2) return theme.tierS;
  if (index <= 5) return theme.tierA;
  if (index === 6) return theme.tierB;
  return theme.tierC;
}

/** Render the trophy card SVG */
export function renderTrophySVG(stats: UserStats, dark: boolean): string {
  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const cats = categories(stats);
  const stepPx = 6; // 5px cell + 1px gap
  const iconCols = TROPHY[0].length;
  const iconWidth = iconCols * stepPx - 1;

  const badges = cats
    .map((cat, i) => {
      const x0 = i * (BADGE + GAP);
      const rank = rankIndex(cat);
      const color = rankColor(rank, theme);
      const rankLabel = rank >= 0 ? RANKS[rank] : "—";
      const iconX = x0 + (BADGE - iconWidth) / 2;
      const iconY = 9;

      const cells: string[] = [];
      for (let row = 0; row < TROPHY.length; row++) {
        for (let col = 0; col < iconCols; col++) {
          const kind = TROPHY[row][col];
          if (kind === ".") continue;
          const x = iconX + col * stepPx;
          const y = iconY + row * stepPx;
          const dim = kind === "2" ? ' fill-opacity=".55"' : "";
          cells.push(`<rect class="tc" x="${x}" y="${y}" fill="${color}"${dim}/>`);
          // Glint overlay sweeps diagonally across the cup, staggered per badge
          if (rank >= 0) {
            const delay = (i * 0.9 + col * 0.09 + row * 0.025).toFixed(2);
            cells.push(
              `<rect class="tc gw" x="${x}" y="${y}" fill="${theme.glint}" style="animation-delay:${delay}s"/>`
            );
          }
        }
      }

      // S-tier badges get two little sparkles twinkling beside the cup
      const sparkles =
        rank >= 0 && rank <= 2
          ? `<rect class="sk" x="${iconX - 2}" y="${iconY - 1}" fill="${theme.sparkle}" style="animation-delay:${(i * 0.7).toFixed(1)}s"/>
    <rect class="sk" x="${iconX + iconWidth - 1}" y="${iconY + 22}" fill="${theme.sparkle}" style="animation-delay:${(i * 0.7 + 1.1).toFixed(1)}s"/>`
          : "";

      return `  <g>
    <rect x="${x0}" y="0" width="${BADGE}" height="${BADGE}" rx="6" fill="${theme.panel}"/>
    ${cells.join("\n    ")}
    ${sparkles}
    <text class="rk" x="${x0 + BADGE / 2}" y="66" text-anchor="middle" fill="${color}">${rankLabel}</text>
    <text class="tt" x="${x0 + BADGE / 2}" y="80" text-anchor="middle">${cat.title}</text>
    <text class="tv" x="${x0 + BADGE / 2}" y="96" text-anchor="middle">${cat.value.toLocaleString("en-US")}</text>
  </g>`;
    })
    .join("\n");

  const css = [
    `text{font-family:${FONT}}`,
    `.tc{width:5px;height:5px;rx:1.2px}`,
    `.gw{fill-opacity:0;animation:gw 6.3s linear infinite}`,
    `@keyframes gw{0%,7%{fill-opacity:0}9.5%{fill-opacity:.6}12%,100%{fill-opacity:0}}`,
    `.sk{width:3px;height:3px;rx:.9px;fill-opacity:0;animation:sk 2.2s ease-in-out infinite}`,
    `@keyframes sk{0%,100%{fill-opacity:0}50%{fill-opacity:.95}}`,
    `.rk{font-size:14px;font-weight:800}`,
    `.tt{font-size:9px;font-weight:600;letter-spacing:.6px;fill:${theme.muted}}`,
    `.tv{font-size:13.5px;font-weight:700;fill:${theme.text}}`,
  ].join("\n");

  const summary = cats
    .map((c) => `${c.title.toLowerCase()} ${RANKS[rankIndex(c)] ?? "unranked"}`)
    .join(", ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="GitHub trophies">
  <title>GitHub trophies — ${summary}</title>
  <style>${css}</style>
${badges}
</svg>
`;
}
