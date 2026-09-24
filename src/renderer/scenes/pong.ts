import { discreteTimeline, num, Scene, SCENE_SECONDS } from "./kit";

/** 3 × 5 pixel digits for the scoreboard */
const DIGITS = [
  "111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
  "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111",
];

/**
 * Pong — the year plays itself. Two paddles guard the first and last
 * weeks, the ball picks up spin from where it meets a paddle, and a
 * slightly lazy AI lets the occasional point through. A dotted net and a
 * pixel scoreboard sit quietly behind the rally.
 */
export const pong: Scene = {
  id: "pong",
  title: "Pong",
  caption: "The year plays itself at Pong",
  hue: "pink",
  dim: 0.66,
  build(ctx) {
    const { grid, colors, rng, px, py, cell, step, cellMask } = ctx;
    const W = grid.width;
    const H = grid.height;
    const tick = 0.06;
    const beginAt = 0.9;
    const endAt = SCENE_SECONDS - 0.5;
    const mid = Math.floor(H / 2);

    let bx = Math.floor(W / 2);
    let by = Math.floor(rng() * H);
    let vx = rng() < 0.5 ? -1 : 1;
    let vy = rng() < 0.5 ? -1 : 1;
    const paddles = [mid, mid];
    const reach = [12 + rng() * 10, 12 + rng() * 10];
    const score = [0, 0];
    const ball: [number, string][] = [];
    const paddleY: [number, string][][] = [[], []];
    const flashes: [number, string][][] = [[], []];
    const goals: [number, string][][] = [[], []];
    const scoreboard: [number, number[]][] = [[0, [0, 0]]];
    let serveAt = beginAt;

    // The row where the ball will reach a paddle column, unfolding wall bounces
    const landing = (): number => {
      const cols = vx < 0 ? bx : W - 1 - bx;
      if (vy === 0) return by;
      const span = 2 * (H - 1);
      const raw = (((by + vy * cols) % span) + span) % span;
      return raw < H ? raw : span - raw;
    };

    // Each approach the defender picks a spot on the paddle to strike with,
    // which sets the return angle, or misreads the ball entirely. Early
    // misreads are guaranteed so every window shows the scoreboard move.
    let approaches = 0;
    let misread = false;
    let english = 0;
    let heading = vx;
    const judge = () => {
      approaches++;
      const points = score[0] + score[1];
      misread = rng() < 0.25 || (approaches >= 2 && points === 0) || (approaches >= 4 && points === 1);
      english = rng() < 0.25 ? 0 : rng() < 0.5 ? -1 : 1;
    };
    judge();

    for (let t = beginAt; t < endAt; t += tick) {
      if (t < serveAt) continue;
      if (vx !== heading) {
        heading = vx;
        judge();
      }
      // Paddles drift home while the ball moves away, and chase its landing
      // row once it is within reach; a small chance to hesitate keeps it human
      for (const side of [0, 1]) {
        const coming = side === 0 ? vx < 0 : vx > 0;
        const distance = side === 0 ? bx : W - 1 - bx;
        const land = landing();
        // A misread aims three rows off, away from the nearer wall
        const want = !coming || distance >= reach[side] ? mid : misread ? land + (land <= mid ? 3 : -3) : land - english;
        const aim = Math.min(Math.max(want, 1), H - 2);
        if (paddles[side] !== aim && rng() > 0.2) paddles[side] += Math.sign(aim - paddles[side]);
        paddleY[side].push([t, num(py(paddles[side] - 1))]);
      }

      let nx = bx + vx;
      let ny = by + vy;
      if (ny < 0 || ny > H - 1) {
        vy = -vy;
        ny = by + vy;
      }
      if (nx === 0 || nx === W - 1) {
        const side = nx === 0 ? 0 : 1;
        const offset = ny - paddles[side];
        if (Math.abs(offset) <= 1) {
          // Return with spin from the part of the paddle that was hit
          vx = -vx;
          vy = offset;
          nx = bx + vx;
          ny = Math.min(Math.max(by + vy, 0), H - 1);
          flashes[side].push([t, colors.glint], [t + 0.14, side === 0 ? colors.sky : colors.pink]);
        } else {
          // A point: the ball slips into the goal column, then a new serve
          const scorer = 1 - side;
          score[scorer]++;
          ball.push([t, `${px(nx)},${py(ny)}`]);
          goals[side].push([t, ".9"], [t + 0.5, "0"]);
          scoreboard.push([t + 0.1, [...score]]);
          serveAt = t + 0.8;
          bx = Math.floor(W / 2);
          by = Math.floor(rng() * H);
          vx = side === 0 ? -1 : 1;
          vy = rng() < 0.5 ? -1 : 1;
          heading = vx;
          judge();
          ball.push([t + tick, "-60,-60"]);
          continue;
        }
      }
      bx = nx;
      by = ny;
      ball.push([t, `${px(bx)},${py(by)}`]);
    }
    ball.push([endAt, "-60,-60"]);

    // The ball and its afterimages share one path of translate steps
    const hidden = "-60,-60";
    const trail = [0, 1, 2, 3].map((k) => {
      const events = ball.map(([t, v]) => [t + k * tick, v] as [number, string]);
      const motion = discreteTimeline("transform", hidden, events, ctx).replace("<animate ", '<animateTransform type="translate" ');
      return `<rect class="pg-ball" width="${cell}" height="${cell}" rx="${ctx.radius}" transform="translate(${hidden})" opacity="${[1, 0.5, 0.26, 0.12][k]}">${motion}</rect>`;
    }).reverse();

    const paddleRects = [0, 1].map((side) => {
      const x = px(side === 0 ? 0 : W - 1);
      const color = side === 0 ? colors.sky : colors.pink;
      const rest = num(py(mid - 1));
      return `<rect x="${x}" y="${rest}" width="${cell}" height="${3 * step - (step - cell)}" rx="${ctx.radius}" fill="${color}">` +
        discreteTimeline("y", rest, paddleY[side], ctx) + discreteTimeline("fill", color, flashes[side], ctx) + `</rect>`;
    });
    const goalRects = [0, 1].map((side) =>
      `<rect x="${px(side === 0 ? 0 : W - 1)}" y="${py(0)}" width="${cell}" height="${H * step}" fill="${side === 0 ? colors.pink : colors.sky}" opacity="0">${discreteTimeline("opacity", "0", goals[side], ctx)}</rect>`
    );

    // Net and scoreboard, quiet behind the play
    const netX = Math.floor(W / 2);
    const net = Array.from({ length: H }, (_, y) => y).filter((y) => y % 2 === 0)
      .map((y) => `<rect class="c pg-net" x="${px(netX)}" y="${py(y)}"/>`);
    const board: string[] = [];
    const top = Math.max(0, Math.floor((H - 5) / 2));
    [netX - 5, netX + 3].forEach((left, side) => {
      for (let i = 0; i < 15; i++) {
        const x = left + (i % 3);
        const y = top + Math.floor(i / 3);
        const on = (s: number[]) => (DIGITS[Math.min(s[side], 9)][i] === "1" ? ".28" : "0");
        const timeline = discreteTimeline("fill-opacity", on([0, 0]), scoreboard.map(([t, s]) => [t, on(s)]), ctx);
        if (on([0, 0]) === "0" && !timeline) continue;
        board.push(`<rect class="c pg-score" x="${px(x)}" y="${py(y)}" fill-opacity="${on([0, 0])}">${timeline}</rect>`);
      }
    });

    const css = `.pg-net{fill:${colors.indigo};fill-opacity:.22}.pg-score{fill:${colors.indigo}}.pg-ball{fill:${colors.amber}}`;
    return {
      css,
      body: `${net.join("")}${board.join("")}<g mask="url(#${cellMask})">${goalRects.join("")}</g>${paddleRects.join("")}${trail.join("")}`,
    };
  },
};
