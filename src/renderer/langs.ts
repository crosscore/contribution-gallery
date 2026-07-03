import { UserStats } from "../types";

/**
 * Top languages card renderer — every bar is a run of rounded contribution
 * cells: filled cells take the language's GitHub color and carry a narrow
 * band of light that periodically sweeps left to right (phase-shifted per
 * cell, like the ambient scenes), unfilled cells stay the empty-cell gray
 * of the graph.
 * Bars use a square-root scale relative to the top language (a linear scale
 * would leave every minor language at a single cell); the printed
 * percentages are the true shares of total bytes across owned non-fork
 * repositories.
 *
 * Designed to sit side by side with the stats card: 375 + gap + 375 ≈ 753,
 * the ambient graph width. Served through GitHub's camo proxy inside an
 * <img>: CSS/SMIL only.
 */

const WIDTH = 375;
const HEIGHT = 195;
const BAR_CELLS = 24;
const MAX_ROWS = 8;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

interface LangsTheme {
  background: string;
  text: string;
  muted: string;
  emptyCell: string;
  fallback: string;
}

const DARK_THEME: LangsTheme = {
  background: "#010409",
  text: "#e6edf3",
  muted: "#8b949e",
  emptyCell: "#161b22",
  fallback: "#8b949e",
};

const LIGHT_THEME: LangsTheme = {
  background: "#ffffff",
  text: "#1f2328",
  muted: "#57606a",
  emptyCell: "#ebedf0",
  fallback: "#6e7681",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Keep GitHub language colors legible on the card background: very dark
 * colors (ShaderLab #222c37, Vim Script …) disappear against the dark
 * theme's near-black empty cells, and near-white ones would vanish on the
 * light card. Blend such colors toward the opposite pole just enough to
 * separate them from the background.
 */
function visibleColor(color: string | null | undefined, dark: boolean, fallback: string): string {
  if (!color) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 255000;
  const blend = (target: number, t: number) =>
    "#" +
    rgb
      .map((c) => Math.round(c + (target - c) * t).toString(16).padStart(2, "0"))
      .join("");
  if (dark && brightness < 0.25) return blend(255, 0.5);
  if (!dark && brightness > 0.9) return blend(0, 0.3);
  return color;
}

function truncate(name: string): string {
  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
}

/** Render the top-languages card SVG */
export function renderLangsSVG(stats: UserStats, dark: boolean): string {
  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const langs = (stats.languages ?? []).slice(0, MAX_ROWS);
  const totalSize = (stats.languages ?? []).reduce((sum, l) => sum + l.size, 0);
  const maxSize = langs[0]?.size ?? 1;

  // --- language rows: name + cell bar + percentage ---
  const stepPx = 7; // 5px cell + 2px gap
  const rows = langs
    .map((lang, i) => {
      const rowY = 58 + i * 17;
      const color = visibleColor(lang.color, dark, theme.fallback);
      const filled = Math.max(1, Math.round(BAR_CELLS * Math.sqrt(lang.size / maxSize)));
      const pct = ((lang.size / totalSize) * 100).toFixed(1);

      const cells: string[] = [];
      for (let col = 0; col < BAR_CELLS; col++) {
        const x = 130 + col * stepPx;
        if (col < filled) {
          const delay = (i * 0.22 + col * 0.11).toFixed(2);
          cells.push(
            `<rect class="bc lc" x="${x}" y="${rowY - 6}" fill="${color}" style="animation-delay:${delay}s"/>`
          );
        } else {
          cells.push(`<rect class="bc" x="${x}" y="${rowY - 6}" fill="${theme.emptyCell}"/>`);
        }
      }

      return `  <g>
    <text class="ln" x="22" y="${rowY}">${esc(truncate(lang.name))}</text>
    ${cells.join("\n    ")}
    <text class="lp" x="353" y="${rowY}" text-anchor="end">${pct}%</text>
  </g>`;
    })
    .join("\n");

  const empty =
    langs.length === 0
      ? `  <text class="ln" x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" fill="${theme.muted}">no language data</text>`
      : "";

  // --- header decoration: 2x2 swatch of the top four language colors ---
  const swatch = langs
    .slice(0, 4)
    .map((lang, i) => {
      const x = 330 + (i % 2) * 9;
      const y = 14 + Math.floor(i / 2) * 9;
      return `<rect class="hd" x="${x}" y="${y}" fill="${visibleColor(lang.color, dark, theme.fallback)}" style="animation-delay:${(i * 0.45).toFixed(2)}s"/>`;
    })
    .join("\n    ");

  const css = [
    `text{font-family:${FONT}}`,
    `.bc{width:5px;height:5px;rx:1.2px}`,
    `.lc{fill-opacity:.68;animation:lw 3.6s ease-in-out infinite}`,
    `@keyframes lw{0%,72%,100%{fill-opacity:.68}86%{fill-opacity:1}}`,
    `.hd{width:7px;height:7px;rx:2px;fill-opacity:.55;animation:hd 3.6s ease-in-out infinite}`,
    `@keyframes hd{0%,100%{fill-opacity:.55}50%{fill-opacity:1}}`,
    `.ttl{font-size:14px;font-weight:700;fill:${theme.text}}`,
    `.ln{font-size:10.5px;font-weight:600;fill:${theme.text}}`,
    `.lp{font-size:10.5px;fill:${theme.muted}}`,
  ].join("\n");

  const summary =
    langs.length > 0
      ? langs
          .map((l) => `${esc(l.name)} ${((l.size / totalSize) * 100).toFixed(1)}%`)
          .join(", ")
      : "no language data";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Top languages">
  <title>Top languages — ${summary}</title>
  <style>${css}</style>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${theme.background}" rx="6"/>
  <text class="ttl" x="22" y="33">Top Languages</text>
  <g>
    ${swatch}
  </g>
${rows}
${empty}
</svg>
`;
}
