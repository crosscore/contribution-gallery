import { num, ramp, Scene, storyAnimation, storyKeyframes } from "./kit";

/**
 * Pathfinder — a maze is carved into the year, then a breadth-first
 * search floods it from the first day. The frontier glows as it spreads;
 * once it touches the latest day, the shortest path is traced back to the
 * start in amber, the way a real search reconstructs its answer.
 */
export const pathfinder: Scene = {
  id: "pathfinder",
  title: "Pathfinder",
  caption: "Breadth-first search through a maze, from the first day to the latest",
  hue: "sky",
  dim: 0.72,
  build(ctx) {
    const { grid, colors, dark, rng, px, py } = ctx;
    const W = grid.width;
    const H = grid.height;
    const open = new Set<number>();
    const key = (x: number, y: number) => x * H + y;

    // Recursive-backtracker maze on the even lattice points, carved with a
    // seeded stack so the corridors change with every render
    const nodesX = Math.ceil(W / 2);
    const nodesY = Math.ceil(H / 2);
    const visited = new Set<number>([0]);
    const stack: [number, number][] = [[0, 0]];
    open.add(key(0, 0));
    while (stack.length) {
      const [nx, ny] = stack[stack.length - 1];
      const options = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        .map(([dx, dy]) => [nx + dx, ny + dy] as [number, number])
        .filter(([ax, ay]) => ax >= 0 && ay >= 0 && ax < nodesX && ay < nodesY && !visited.has(ax * nodesY + ay));
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [ax, ay] = options[Math.floor(rng() * options.length)];
      visited.add(ax * nodesY + ay);
      open.add(key(nx + ax, ny + ay));
      open.add(key(ax * 2, ay * 2));
      stack.push([ax, ay]);
    }
    // A few extra openings braid the maze so frontiers split and rejoin
    const walls: number[] = [];
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if ((x + y) % 2 === 1 && !open.has(key(x, y))) walls.push(key(x, y));
      }
    }
    for (let i = 0; i < Math.round(W / 6) && walls.length; i++) {
      open.add(walls.splice(Math.floor(rng() * walls.length), 1)[0]);
    }

    // Breadth-first search from the first day
    const goalX = (nodesX - 1) * 2;
    const goalY = (nodesY - 1) * 2;
    const distance = new Map<number, number>([[key(0, 0), 0]]);
    const parent = new Map<number, number>();
    const queue = [key(0, 0)];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const cx = Math.floor(cur / H);
      const cy = cur % H;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const x = cx + dx;
        const y = cy + dy;
        const k = key(x, y);
        if (x < 0 || y < 0 || x >= W || y >= H || !open.has(k) || distance.has(k)) continue;
        distance.set(k, distance.get(cur)! + 1);
        parent.set(k, cur);
        queue.push(k);
      }
    }
    const goal = key(goalX, goalY);
    const reach = distance.get(goal) ?? Math.max(...distance.values());
    const route: number[] = [];
    for (let k: number | undefined = goal; k !== undefined; k = parent.get(k)) route.push(k);

    const floodAt = 1.2;
    const perStep = Math.min(0.08, 7.2 / Math.max(reach, 1));
    const foundAt = floodAt + reach * perStep + 0.35;
    const perTrace = Math.min(0.06, 1.8 / Math.max(route.length, 1));
    const flood = [colors.mint, colors.sky, colors.indigo, colors.violet];
    const faint = dark ? ".2" : ".22";

    const corridors: string[] = [];
    for (const k of open) {
      const x = Math.floor(k / H);
      const y = k % H;
      const d = distance.get(k);
      const color = ramp(flood, (d ?? reach) / Math.max(reach, 1));
      // Cells past the goal are never searched and stay as faint corridor
      const delay = d !== undefined && d <= reach ? `;animation-delay:${num(d * perStep)}s` : ";animation:none";
      corridors.push(`<rect class="c pf" x="${px(x)}" y="${py(y)}" style="--c:${color}${delay}"/>`);
    }
    const trace = route.map((k, i) =>
      `<rect class="c pt" x="${px(Math.floor(k / H))}" y="${py(k % H)}" style="animation-delay:${num(i * perTrace)}s"/>`
    );
    const ends = [key(0, 0), goal].map((k) =>
      `<rect class="c pe" x="${px(Math.floor(k / H))}" y="${py(k % H)}"/>`
    );

    const css =
      `.pf{fill:var(--c);fill-opacity:${faint};${storyAnimation("pff", ctx)}}` +
      storyKeyframes("pff", [
        [floodAt, `fill:${colors.glint};fill-opacity:${faint}`],
        [floodAt + 0.05, `fill:${colors.glint};fill-opacity:1`],
        [floodAt + 0.45, `fill:var(--c);fill-opacity:.9`],
        [floodAt + 1.4, `fill:var(--c);fill-opacity:.62`],
      ], `fill:var(--c);fill-opacity:${faint}`, ctx) +
      `.pf-layer{${storyAnimation("pfl", ctx)}}` +
      storyKeyframes("pfl", [[foundAt, "opacity:1"], [foundAt + 0.9, "opacity:.42"]], "opacity:1", ctx) +
      `.pt{fill:${colors.amber};fill-opacity:0;${storyAnimation("ptr", ctx)}}` +
      storyKeyframes("ptr", [
        [foundAt, `fill:${colors.glint};fill-opacity:0`],
        [foundAt + 0.06, `fill:${colors.glint};fill-opacity:1`],
        [foundAt + 0.5, `fill:${colors.amber};fill-opacity:1`],
      ], "fill-opacity:0", ctx) +
      `.pe{fill:${colors.amber};animation:pe 1.1s ease-in-out infinite}` +
      `@keyframes pe{0%,100%{fill-opacity:1}50%{fill-opacity:.35}}`;

    return { css, body: `<g class="pf-layer">${corridors.join("")}</g>${trace.join("")}${ends.join("")}` };
  },
};
