import { num, Scene, shuffle, storyTween } from "./kit";

interface Star { x: number; y: number; }

/**
 * Constellation — the busiest days become stars and a pen joins them into
 * a star chart: the minimum spanning tree over the stars, drawn edge by
 * edge in depth-first order. Faint dust twinkles across the rest of the sky.
 */
export const constellation: Scene = {
  id: "constellation",
  title: "Constellation",
  caption: "The busiest days, joined into a star chart",
  hue: "amber",
  dim: 0.6,
  build(ctx) {
    const { grid, colors, dark, rng, px, py, cell } = ctx;
    const W = grid.width;
    const H = grid.height;
    const target = Math.max(8, Math.round(W / 4));
    const spacing = 4.2;

    // Busier days first, random among equals, kept apart so the chart spans the year
    const cells: (Star & { level: number })[] = [];
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) cells.push({ x, y, level: grid.cells[x][y].contributionLevel });
    }
    const ranked = shuffle(cells, rng).sort((a, b) => b.level - a.level);
    const stars: Star[] = [];
    for (const c of ranked) {
      if (stars.every((s) => Math.hypot(s.x - c.x, s.y - c.y) >= spacing)) stars.push(c);
      if (stars.length === target) break;
    }

    // Prim's minimum spanning tree, then a depth-first walk from the earliest star
    const n = stars.length;
    const dist = (a: Star, b: Star) => Math.hypot(a.x - b.x, a.y - b.y);
    const adjacency: number[][] = stars.map(() => []);
    const inTree = new Set<number>([0]);
    while (inTree.size < n) {
      let best: [number, number] = [-1, -1];
      let bestD = Infinity;
      for (const i of inTree) {
        for (let j = 0; j < n; j++) {
          if (inTree.has(j)) continue;
          const d = dist(stars[i], stars[j]);
          if (d < bestD) {
            bestD = d;
            best = [i, j];
          }
        }
      }
      adjacency[best[0]].push(best[1]);
      adjacency[best[1]].push(best[0]);
      inTree.add(best[1]);
    }
    const root = stars.reduce((r, s, i) => (s.x < stars[r].x ? i : r), 0);
    const edges: [number, number][] = [];
    const seen = new Set<number>([root]);
    const walk = (i: number) => {
      const next = adjacency[i].filter((j) => !seen.has(j)).sort((a, b) => stars[a].x - stars[b].x);
      for (const j of next) {
        if (seen.has(j)) continue;
        seen.add(j);
        edges.push([i, j]);
        walk(j);
      }
    };
    walk(root);

    // Pen timing: each edge takes time proportional to its length
    const center = (s: Star) => [px(s.x) + cell / 2, py(s.y) + cell / 2];
    const lit = new Map<number, number>([[root, 1.2]]);
    let t = 1.4;
    const lines = edges.map(([i, j]) => {
      const [x1, y1] = center(stars[i]);
      const [x2, y2] = center(stars[j]);
      const length = Math.hypot(x2 - x1, y2 - y1);
      const drawn = 0.22 + length / 260;
      const from = t;
      t += drawn + 0.08;
      lit.set(j, from + drawn);
      const L = num(length);
      const draw = storyTween("stroke-dashoffset", L, [[from, L], [from + drawn, "0"]], ctx);
      return `<path class="cn-line" d="M${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}" stroke-dasharray="${L}" stroke-dashoffset="${L}">${draw}</path>`;
    });

    // Stars glow dimly until the pen reaches them, then ignite and twinkle
    const starCells = stars.map((s, i) => {
      const at = lit.get(i) ?? 1.2;
      const ignite = storyTween("opacity", "0", [[at, "0"], [at + 0.3, "1"]], ctx);
      return `<rect class="c cn-dim" x="${px(s.x)}" y="${py(s.y)}"/>` +
        `<rect class="c cn-star" x="${px(s.x)}" y="${py(s.y)}" opacity="0" style="animation-duration:${num(2.2 + rng() * 2.4)}s;animation-delay:-${num(rng() * 3)}s">${ignite}</rect>`;
    });

    const starSet = new Set(stars.map((s) => `${s.x},${s.y}`));
    const dust = shuffle(cells.filter((c) => !starSet.has(`${c.x},${c.y}`)), rng)
      .slice(0, Math.round(W * 1.3))
      .map((c) => `<rect class="c cn-dust" x="${px(c.x)}" y="${py(c.y)}" style="animation-duration:${num(2.8 + rng() * 4)}s;animation-delay:-${num(rng() * 6)}s"/>`);

    const line = dark ? "#dbeafe" : colors.sky;
    const css =
      `.cn-line{fill:none;stroke:${line};stroke-width:1.3;stroke-linecap:round;stroke-opacity:${dark ? ".62" : ".7"}}` +
      `.cn-dim{fill:${colors.amber};fill-opacity:.28}` +
      `.cn-star{fill:${colors.amber};animation:cns 3s ease-in-out infinite}` +
      `@keyframes cns{0%,100%{fill-opacity:1}50%{fill-opacity:.62}}` +
      `.cn-dust{fill:${colors.indigo};fill-opacity:0;animation:cnd 4s ease-in-out infinite}` +
      `@keyframes cnd{0%,100%{fill-opacity:0}50%{fill-opacity:${dark ? ".42" : ".5"}}}`;

    return { css, body: dust.join("") + lines.join("") + starCells.join("") };
  },
};
