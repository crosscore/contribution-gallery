import { discreteTimeline, num, Scene, storyAnimation, storyKeyframes } from "./kit";

/**
 * Sort — every week becomes a bar, its height ranked by that week's
 * activity, standing in calendar order. An odd–even transposition sort
 * then swaps neighbours in parallel passes until the year stands as a
 * clean staircase, and a verification sweep runs along the finished bars.
 *
 * Each bar is a single rect whose top edge steps between cell rows,
 * masked by the cell lattice, so a column costs one discrete timeline.
 */
export const sort: Scene = {
  id: "sort",
  title: "Sort",
  caption: "Weeks ranked by activity, sorted in parallel passes",
  hue: "indigo",
  dim: 0.66,
  build(ctx) {
    const { grid, colors, rng, px, py, cell, step, cellMask } = ctx;
    const W = grid.width;
    const H = grid.height;

    // Rank weeks by activity (ties broken at random) and spread the ranks
    // evenly over 1..H cells so the sorted year becomes a staircase
    const totals = Array.from({ length: W }, (_, x) =>
      grid.cells[x].reduce((sum, c) => sum + c.contributionLevel, 0));
    const order = totals.map((total, x) => ({ x, total, tie: rng() }))
      .sort((a, b) => a.total - b.total || a.tie - b.tie);
    const heights = new Array<number>(W);
    order.forEach(({ x }, rank) => {
      heights[x] = 1 + Math.floor((rank * H) / W);
    });

    const passes = (bars: number[], onSwap?: (i: number, round: number) => void): number => {
      let round = 0;
      let quiet = 0;
      while (quiet < 2) {
        let swapped = false;
        for (let i = round % 2; i + 1 < bars.length; i += 2) {
          if (bars[i] > bars[i + 1]) {
            [bars[i], bars[i + 1]] = [bars[i + 1], bars[i]];
            swapped = true;
            onSwap?.(i, round);
          }
        }
        quiet = swapped ? 0 : quiet + 1;
        round++;
      }
      return round;
    };
    const rounds = Math.max(passes([...heights]) - 2, 1);
    const sortAt = 1.5;
    const perRound = Math.min(0.2, 8.2 / rounds);
    const sweepAt = sortAt + rounds * perRound + 0.45;

    const top = (h: number) => py(H - h);
    const events: [number, string][][] = heights.map(() => []);
    const bars = [...heights];
    passes(bars, (i, round) => {
      const at = sortAt + round * perRound;
      events[i].push([at, num(top(bars[i]))]);
      events[i + 1].push([at, num(top(bars[i + 1]))]);
    });

    const columns = heights.map((h, x) =>
      `<rect x="${px(x)}" y="${num(top(h))}" width="${cell}" height="${H * step}">${discreteTimeline("y", num(top(h)), events[x], ctx)}</rect>`
    );
    const sweep = bars.map((h, x) =>
      `<rect class="so-sweep" x="${px(x)}" y="${num(top(h))}" width="${cell}" height="${h * step}" style="animation-delay:${num(x * 0.028)}s"/>`
    );

    const bottom = py(H - 1) + cell;
    const stops = [colors.emerald, colors.mint, colors.sky, colors.indigo, colors.violet]
      .map((c, i, all) => `<stop offset="${num(i / (all.length - 1))}" stop-color="${c}"/>`).join("");
    const css =
      `.so-sweep{fill:${colors.glint};fill-opacity:0;${storyAnimation("sosw", ctx)}}` +
      storyKeyframes("sosw", [
        [sweepAt, "fill-opacity:0"],
        [sweepAt + 0.08, "fill-opacity:.85"],
        [sweepAt + 0.7, "fill-opacity:0"],
      ], "fill-opacity:0", ctx);

    return {
      css,
      body: `<defs><linearGradient id="so-grad" gradientUnits="userSpaceOnUse" x1="0" y1="${bottom}" x2="0" y2="${py(0)}">${stops}</linearGradient></defs>` +
        `<g mask="url(#${cellMask})" fill="url(#so-grad)">${columns.join("")}</g>` +
        `<g mask="url(#${cellMask})">${sweep.join("")}</g>`,
    };
  },
};
