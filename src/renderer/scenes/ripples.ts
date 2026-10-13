import { Hue, num, Scene, shuffle } from "./kit";

const HUES: Hue[] = ["sky", "mint", "indigo", "violet", "sky", "mint"];

/**
 * Ripples — rain falls on the days you showed up. Each drop flashes on its
 * cell and sends two rings spreading across the lattice; busier days make
 * wider rings, and where rings cross, both light the water. Every drop
 * keeps its own rhythm, so the surface never settles into a pattern.
 */
export const ripples: Scene = {
  id: "ripples",
  title: "Ripples",
  caption: "Rain on the days you showed up, rippling across the year",
  hue: "sky",
  dim: 0.58,
  build({ grid, colors, dark, rng, px, py, cell, step, cellMask }) {
    const W = grid.width;
    const H = grid.height;

    // Active days, busier ones first with some shuffle, spaced apart
    const days: { x: number; y: number; level: number; rank: number }[] = [];
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const level = grid.cells[x][y].contributionLevel;
        days.push({ x, y, level, rank: level + rng() * 2.5 });
      }
    }
    const drops: typeof days = [];
    for (const d of shuffle(days, rng).sort((a, b) => b.rank - a.rank)) {
      if (drops.every((o) => Math.max(Math.abs(o.x - d.x), Math.abs(o.y - d.y) * 2) >= 4)) drops.push(d);
      if (drops.length === 20) break;
    }

    const splashes: string[] = [];
    const rings: string[] = [];
    drops.forEach((d, i) => {
      const period = 3.6 + rng() * 2.6;
      const phase = rng() * period;
      const cx = num(px(d.x) + cell / 2);
      const cy = num(py(d.y) + cell / 2);
      const color = colors[HUES[i % HUES.length]];
      const R = (2.1 + d.level * 0.55) * step;
      const spread = 2.4;
      const f = (s: number) => (s / period).toFixed(4);
      const loop = (attr: string, values: string, times: string, splines: string, begin: number) =>
        `<animate attributeName="${attr}" values="${values}" keyTimes="${times}" calcMode="spline" keySplines="${splines}" dur="${num(period)}s" begin="-${num(((begin % period) + period) % period)}s" repeatCount="indefinite"/>`;

      splashes.push(
        // On a white card the brightest ink would read as a hole, so drops flash in their own hue
        `<rect class="c" x="${px(d.x)}" y="${py(d.y)}" fill="${dark ? colors.glint : color}" opacity="0">` +
          loop("opacity", "0;1;0;0", `0;${f(0.06)};${f(0.9)};1`, ".2 .6 .3 1;.4 0 .6 1;0 0 1 1", phase) + `</rect>`
      );
      // Two rings per drop: the second follows a beat later, smaller and softer
      for (const [lag, size, strength] of [[0, 1, 1], [0.45, 0.62, 0.7]]) {
        const r = num(R * size);
        rings.push(
          `<circle class="rp-ring" cx="${cx}" cy="${cy}" r="0" stroke="${color}" opacity="0">` +
            loop("r", `0;${r};0`, `0;${f(spread)};1`, ".15 .6 .35 1;0 0 1 1", phase - lag) +
            loop("stroke-width", "9;1.5;9", `0;${f(spread)};1`, ".2 .5 .4 1;0 0 1 1", phase - lag) +
            loop("opacity", `0;${strength};0;0`, `0;${f(0.08)};${f(spread)};1`, ".2 .6 .3 1;.3 0 .7 1;0 0 1 1", phase - lag) +
            `</circle>`
        );
      }
    });

    const css = `.rp-ring{fill:none}`;
    return { css, body: `<g mask="url(#${cellMask})">${rings.join("")}</g>${splashes.join("")}` };
  },
};
