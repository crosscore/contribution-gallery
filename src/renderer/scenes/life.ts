import { Scene, SCENE_SECONDS } from "./kit";

/**
 * Life — Conway's Game of Life (B3/S23 on a torus) seeded by the graph:
 * the busiest days always start alive and other active days join a random
 * soup. Births fade in, deaths leave a brief afterglow, and the seed is
 * re-injected whenever the population dies out or settles into a loop.
 */
export const life: Scene = {
  id: "life",
  title: "Life",
  caption: "Conway's Game of Life, seeded by the days you showed up",
  hue: "lime",
  dim: 0.6,
  build(ctx) {
    const { grid, colors, rng, px, py, cycle, start } = ctx;
    const W = grid.width;
    const H = grid.height;
    const size = W * H;
    const stepSec = 0.65;
    const riseSec = 0.2;
    const fadeSec = 0.5;
    const showAt = start + 0.6;
    const lastStepAt = start + SCENE_SECONDS - 1.6;

    const initial = new Array<boolean>(size).fill(false);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const level = grid.cells[x][y].contributionLevel;
        initial[x * H + y] = level >= 2 || (level === 1 && rng() < 0.27) || (level === 0 && rng() < 0.06);
      }
    }

    const evolve = (s: boolean[]): boolean[] => {
      const next = new Array<boolean>(size).fill(false);
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
          let n = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if ((dx || dy) && s[((x + dx + W) % W) * H + ((y + dy + H) % H)]) n++;
            }
          }
          const idx = x * H + y;
          next[idx] = s[idx] ? n === 2 || n === 3 : n === 3;
        }
      }
      return next;
    };

    // Per-cell opacity keys: a birth ramps up over riseSec, a death fades
    // out over fadeSec as an afterglow. Every animated cell starts invisible.
    // Four-decimal key times (13 ms on this cycle) keep the markup lean.
    const values = new Map<number, string[]>();
    const keyTimes = new Map<number, string[]>();
    const pushKey = (idx: number, atSec: number, value: string) => {
      if (!values.has(idx)) {
        values.set(idx, ["0"]);
        keyTimes.set(idx, ["0"]);
      }
      values.get(idx)!.push(value);
      keyTimes.get(idx)!.push(Math.min(atSec / cycle, 1).toFixed(4));
    };
    const pushFlip = (idx: number, atSec: number, on: boolean) => {
      pushKey(idx, atSec, on ? "0" : "1");
      pushKey(idx, atSec + (on ? riseSec : fadeSec), on ? "1" : "0");
    };

    let current = initial.slice();
    current.forEach((alive, idx) => {
      if (alive) pushFlip(idx, showAt, true);
    });

    const history: string[] = [];
    let stagnation = 0;
    for (let t = showAt + stepSec; t <= lastStepAt; t += stepSec) {
      let next = evolve(current);
      const hash = next.map((b) => (b ? "1" : "0")).join("");
      stagnation = history.includes(hash) ? stagnation + 1 : 0;
      history.push(hash);
      if (history.length > 6) history.shift();

      if (next.filter(Boolean).length < 8 || stagnation >= 6) {
        const merged = next.map((b, i) => b || initial[i]);
        next = merged.every((b, i) => b === next[i]) ? initial.slice() : merged;
        stagnation = 0;
        history.length = 0;
      }
      next.forEach((alive, idx) => {
        if (alive !== current[idx]) pushFlip(idx, t, alive);
      });
      current = next;
    }
    // Once the window closes, survivors rest at zero so a wrap-around
    // crossfade into this window starts from an empty board
    const end = start + SCENE_SECONDS;
    if (end < cycle) {
      current.forEach((alive, idx) => {
        if (!alive) return;
        pushKey(idx, end - 0.01, "1");
        pushKey(idx, end, "0");
      });
    }

    const parts: string[] = [];
    for (const [idx, vals] of values) {
      // Linear calcMode needs the list to end at keyTime 1; hold the last state
      const times = keyTimes.get(idx)!;
      const held = [...vals, vals[vals.length - 1]];
      parts.push(
        `<rect class="c lf" x="${px(Math.floor(idx / H))}" y="${py(idx % H)}" opacity="0"><animate attributeName="opacity" values="${held.join(";")}" keyTimes="${[...times, "1"].join(";")}" dur="${cycle}s" repeatCount="indefinite"/></rect>`
      );
    }

    return { css: `.lf{fill:${colors.lime}}`, body: parts.join("") };
  },
};
