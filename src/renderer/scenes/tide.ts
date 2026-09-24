import { levelCss, num, Scene } from "./kit";

/**
 * Tide — one long sine swell travels across the year, deep teal at the
 * sea floor rising to pale foam at each crest; the whole graph rolls as a
 * single coherent wave.
 */
export const tide: Scene = {
  id: "tide",
  title: "Tide",
  caption: "One long swell rolling from the first week to the last",
  hue: "mint",
  dim: 0.35,
  build({ grid, colors, px, py }) {
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
        parts.push(`<rect class="c td h${H - 1 - y} o${lvl} v${x}" x="${px(x)}" y="${py(y)}"/>`);
      }
    }

    const css =
      `.td{fill-opacity:0;animation-duration:${period}s;animation-timing-function:linear;animation-iteration-count:infinite}` +
      rowCss.join("") +
      levelCss("o", (l) => (l > 0 ? 0.5 + 0.11 * l : 0.42)) +
      columnCss.join("");

    return { css, body: parts.join("") };
  },
};
