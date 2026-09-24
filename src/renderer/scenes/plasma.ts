import { levelCss, num, Scene } from "./kit";

/**
 * Plasma — demoscene palette cycling. Every cell holds a fixed value of a
 * sum-of-sines field; one shared keyframe rotates the palette through
 * those values, so bands of color roll along the contours of the field.
 * A second, slower field modulates brightness so the ridges breathe.
 */
export const plasma: Scene = {
  id: "plasma",
  title: "Plasma",
  caption: "Demoscene palette cycling, rolling across the year",
  hue: "violet",
  dim: 0.3,
  build({ grid, colors, dark, rng, px, py }) {
    const c = colors;
    // Dark cards take the full hue ring; on white, a palindrome avoids muddy mixes
    const ring = dark
      ? [c.mint, c.sky, c.indigo, c.violet, c.pink, c.amber]
      : [c.mint, c.sky, c.indigo, c.violet, c.pink, c.violet, c.indigo, c.sky];
    const hueSeconds = 10;
    const breathSeconds = 5.6;
    const bands = 1.15;
    const cx = 8 + rng() * (grid.width - 16);
    const cy = rng() * (grid.height - 1);
    const [a, b, d, e] = [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2);

    const stops = ring.map((color, i) => `${num((i / ring.length) * 100)}%{fill:${color}}`).join("");
    const css =
      `.pl{fill:${ring[0]};fill-opacity:var(--p);animation:plh ${hueSeconds}s linear infinite var(--a),pls ${breathSeconds}s ease-in-out infinite var(--b)}` +
      `@keyframes plh{${stops}100%{fill:${ring[0]}}}` +
      `@keyframes pls{0%,100%{fill-opacity:var(--q)}50%{fill-opacity:var(--p)}}` +
      levelCss("m", (l) => (dark ? 0.74 : 0.68) + 0.065 * l, 0.55);

    // Low frequencies keep neighbouring cells close in value, so the palette
    // reads as broad flowing bands rather than confetti
    const parts: string[] = [];
    for (let x = 0; x < grid.width; x++) {
      for (let y = 0; y < grid.height; y++) {
        const v =
          Math.sin(x / 7.5 + a) +
          Math.sin((x * 0.45 + y) / 4.6 + b) +
          Math.sin(Math.hypot((x - cx) * 0.5, (y - cy) * 1.1) / 2.6) +
          Math.sin(x / 14 - y / 3.4 + d);
        const w = Math.sin(x / 6.2 - y / 2.8 + e) + Math.sin(Math.hypot(x - cx, (y - cy) * 1.5) / 4);
        const hue = ((((v + 4) / 8) * bands) % 1) * hueSeconds;
        const breath = (((w + 2) / 4) % 1) * breathSeconds;
        const lvl = grid.cells[x][y].contributionLevel;
        parts.push(`<rect class="c pl m${lvl}" x="${px(x)}" y="${py(y)}" style="--a:-${hue.toFixed(1)}s;--b:-${breath.toFixed(1)}s"/>`);
      }
    }
    return { css, body: parts.join("") };
  },
};
