import { levelCss, num, Scene } from "./kit";

/** Column periods; each gets its own keyframes so trails decay in absolute time */
const PERIODS = [2.3, 3.1, 3.9];

/**
 * Code Rain — glyph streams fall down every column at their own speed.
 * A bright head leads each drop and a green trail decays behind it over a
 * fixed interval, so slow columns draw long streaks and fast ones short
 * darts. Columns rest dark between drops, which keeps the streaks legible.
 */
export const codeRain: Scene = {
  id: "code-rain",
  title: "Code Rain",
  caption: "Green glyph streams, each falling at its own pace",
  hue: "emerald",
  dim: 0.74,
  build({ grid, colors, dark, rng, px, py }) {
    const head = dark ? colors.glint : "#064e3b";
    const trail = dark ? colors.emerald : "#10b981";

    const keyframes = PERIODS.map((period, i) => {
      const p = (s: number) => `${num((s / period) * 100)}%`;
      return `.k${i}{animation-name:cr${i};animation-duration:${period}s}` +
        `@keyframes cr${i}{0%{fill:${head};fill-opacity:var(--p)}${p(0.07)}{fill:${trail};fill-opacity:var(--p)}` +
        `${p(0.34)}{fill-opacity:var(--q)}${p(0.85)},100%{fill-opacity:0}}`;
    }).join("");

    const parts: string[] = [];
    for (let x = 0; x < grid.width; x++) {
      const kind = Math.floor(rng() * PERIODS.length);
      const period = PERIODS[kind];
      const perRow = 0.075 + rng() * 0.06;
      const phase = rng() * period;
      for (let y = 0; y < grid.height; y++) {
        // Cell y lights at phase + y·perRow (mod period): drops fall downward
        const at = (phase + y * perRow) % period;
        const lvl = grid.cells[x][y].contributionLevel;
        parts.push(`<rect class="c cr n${lvl} k${kind}" x="${px(x)}" y="${py(y)}" style="--d:-${num((period - at) % period)}s"/>`);
      }
    }

    const css =
      `.cr{fill:${trail};fill-opacity:0;animation-timing-function:linear;animation-iteration-count:infinite;animation-delay:var(--d)}` +
      keyframes +
      levelCss("n", (l) => (l > 0 ? 0.86 + 0.035 * l : 0.7), 0.42);

    return { css, body: parts.join("") };
  },
};
