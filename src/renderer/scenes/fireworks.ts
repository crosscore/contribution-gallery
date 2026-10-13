import { discreteTimeline, Hue, num, Scene, SceneContext, shuffle, storyKeyframes, storyTween } from "./kit";

/** Ease-out for bursts: fast at first, settling as the shell spends itself */
const BURST = ".1 .7 .3 1";
/** Gentle ease-in-out for glows and fades */
const SOFT = ".45 0 .55 1";
/** Shell colour pairs: ring hue and spark hue */
const PAIRS: [Hue, Hue][] = [
  ["pink", "amber"], ["sky", "violet"], ["violet", "pink"], ["mint", "sky"],
  ["amber", "rose"], ["indigo", "mint"], ["rose", "amber"], ["lime", "mint"],
];

/** Spark flight plans (rotations of the twelve spokes) shared by every shell */
const SPARK_PLANS = 2;
const SPARK_HOPS = 5;

/**
 * One keyframe set per spark: it hops outward a cell at a time, quickly at
 * first, then slowing, sinking and dimming, and finally drifts down a row
 * or two like a willow's last embers. Times are relative to the burst; each
 * spark element shifts the shared story to its own burst with a delay, and
 * the cell mask hides any hop that leaves the lattice.
 */
function sparkPlans(ctx: SceneContext): string {
  const { step, cycle } = ctx;
  const css: string[] = [];
  for (let p = 0; p < SPARK_PLANS; p++) {
    for (let k = 0; k < 12; k++) {
      const a = (p * Math.PI) / 12 + (k * Math.PI) / 6;
      const stops: [number, string][] = [];
      const hop = (t: number, dx: number, dy: number, o: number) =>
        stops.push([t, `opacity:${num(o)};transform:translate(${dx * step}px,${dy * step}px)`]);
      let last = 0;
      for (let j = 1; j <= SPARK_HOPS; j++) {
        const u = j / SPARK_HOPS;
        const dx = Math.round(Math.cos(a) * j * 1.15);
        const dy = Math.round(Math.sin(a) * j * 0.85 + 0.35 * j * u);
        last = 1.5 * (1 - Math.sqrt(1 - u * 0.96));
        hop(last, dx, dy, 1 - 0.6 * u);
        if (j === SPARK_HOPS) {
          for (let f = 1; f <= 2; f++) hop(last + 0.28 * f, dx, dy + f, 0.4 / f);
        }
      }
      stops.push([last + 0.86, "opacity:0;transform:translate(0px,0px)"]);
      css.push(storyKeyframes(`fwp${p}-${k}`, stops, "opacity:0;transform:translate(0px,0px)", ctx) +
        `.fw-p${p}-${k}{animation-name:fwp${p}-${k}}`);
    }
  }
  return `.fw-spark{opacity:0;animation-duration:${cycle}s;animation-timing-function:step-end;animation-iteration-count:infinite}` + css.join("");
}

/**
 * Fireworks — the busiest weeks are launched into the night. A rocket
 * climbs each chosen column, then bursts into a chrysanthemum: a ring of
 * light swells across the lattice while twelve pixel sparks hop outward
 * cell by cell, slowing and sagging under gravity as they fade, leaving a
 * few crackling embers. Bigger weeks make bigger shells, and each burst
 * briefly lights the sky around it.
 */
export const fireworks: Scene = {
  id: "fireworks",
  title: "Fireworks",
  caption: "Your biggest weeks, launched into the night sky",
  hue: "pink",
  dim: 0.72,
  build(ctx) {
    const { grid, colors, dark, rng, px, py, cell, step, cellMask } = ctx;
    const W = grid.width;
    const H = grid.height;
    const totals = Array.from({ length: W }, (_, x) => grid.cells[x].reduce((sum, c) => sum + c.contributionLevel, 0));
    const busiest = Math.max(1, ...totals);

    // The busiest weeks, random among equals, kept apart so bursts read one by one
    const columns = shuffle(Array.from({ length: W }, (_, x) => x), rng).sort((a, b) => totals[b] - totals[a]);
    const picks: number[] = [];
    for (const x of columns) {
      if (x < 3 || x > W - 4) continue;
      if (picks.every((p) => Math.abs(p - x) >= 6)) picks.push(x);
      if (picks.length === 8) break;
    }
    const order = shuffle(picks, rng);
    const pairs = shuffle(PAIRS, rng);

    const climbPerRow = 0.075;
    // Shells go up one by one, then the last three together as a finale
    const finale = Math.min(3, Math.max(order.length - 2, 0));
    const solo = order.length - finale;
    const launchAt = (i: number) => i < solo
      ? 0.7 + (i * 7.6) / Math.max(solo - 1, 1) + (rng() - 0.5) * 0.4
      : 9.7 + (i - solo) * 0.32;
    const center = (x: number, y: number) => [px(x) + cell / 2, py(y) + cell / 2];
    const right = px(W - 1) + cell;
    const bottom = py(H - 1) + cell;

    const defs: string[] = [];
    const glows: string[] = [];
    const shells: string[] = [];
    const rockets: string[] = [];
    const embers: string[] = [];
    const sparks: string[] = [];

    order.forEach((x, i) => {
      const launch = launchAt(i);
      const burstRow = 2 + Math.floor(rng() * 2);
      const burstAt = launch + (H - 1 - burstRow) * climbPerRow;
      const [ringHue, sparkHue] = pairs[i % pairs.length];
      const ring = colors[ringHue];
      const spark = colors[sparkHue];
      // Flashes burn white on the night card and in the shell's own hue on a white one
      const flash = dark ? colors.glint : ring;
      const weight = totals[x] / busiest;
      const R = (2.1 + 1.6 * weight) * step;
      const [cx, cy] = center(x, burstRow);

      // The rocket: a bright head and a fainter tail, stepping up one row at a time
      for (const [lag, cls] of [[0, "fw-rk"], [climbPerRow, "fw-tail"]] as const) {
        const climb: [number, string][] = [];
        for (let y = H - 1; y > burstRow; y--) climb.push([launch + lag + (H - 1 - y) * climbPerRow, num(py(y))]);
        const show = discreteTimeline("opacity", "0", [[launch + lag, "1"], [burstAt + lag, "0"]], ctx);
        rockets.push(`<rect class="c ${cls}" x="${px(x)}" y="${py(H - 1)}" opacity="0">${discreteTimeline("y", num(py(H - 1)), climb, ctx)}${show}</rect>`);
      }

      // A ring that swells from the burst point, bright at its leading edge
      defs.push(
        `<radialGradient id="fw-ring-${i}"><stop offset=".5" stop-color="${ring}" stop-opacity="0"/><stop offset=".8" stop-color="${ring}" stop-opacity=".85"/>` +
          `<stop offset=".93" stop-color="${flash}"/><stop offset="1" stop-color="${ring}" stop-opacity="0"/></radialGradient>` +
          `<radialGradient id="fw-glow-${i}"><stop stop-color="${ring}" stop-opacity="${dark ? ".42" : ".26"}"/><stop offset="1" stop-color="${ring}" stop-opacity="0"/></radialGradient>`
      );
      const swell = storyTween("r", "0", [[burstAt, "0"], [burstAt + 1.15, num(R)]], ctx, BURST);
      const fade = storyTween("opacity", "0", [[burstAt, "0"], [burstAt + 0.05, "1"], [burstAt + 0.85, "1"], [burstAt + 2.3, "0"]], ctx, SOFT);
      const sag = storyTween("transform", "0 0", [[burstAt + 0.3, "0 0"], [burstAt + 2.3, `0 ${num(step * 0.9)}`]], ctx, SOFT)
        .replace("<animate ", '<animateTransform type="translate" ');

      shells.push(
        `<g transform="translate(0 0)">${sag}` +
          `<circle cx="${num(cx)}" cy="${num(cy)}" r="0" fill="url(#fw-ring-${i})" opacity="0">${swell}${fade}</circle></g>`
      );

      // Twelve sparks on one of the shared flight plans, timed to this burst;
      // a fainter twin trails one hop behind
      const plan = Math.floor(rng() * SPARK_PLANS);
      for (let k = 0; k < 12; k++) {
        const color = k % 2 ? spark : ring;
        for (const [lag, cls] of [[0, ""], [0.09, " fw-trail"]] as const) {
          sparks.push(`<rect class="c fw-spark fw-p${plan}-${k}${cls}" x="${px(x)}" y="${py(burstRow)}" fill="${color}" style="animation-delay:${num(burstAt + lag)}s"/>`);
        }
      }

      // The burst lights the sky between the cells for a moment
      const flare = storyTween("opacity", "0", [[burstAt, "0"], [burstAt + 0.08, "1"], [burstAt + 1.7, "0"]], ctx, SOFT);
      glows.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(R * 1.5)}" fill="url(#fw-glow-${i})" opacity="0">${flare}</circle>`);

      // Embers crackle on a few cells inside the spent shell
      const inside: [number, number][] = [];
      for (let ex = x - 4; ex <= x + 4; ex++) {
        for (let ey = 0; ey < H; ey++) {
          if (ex >= 0 && ex < W && Math.hypot(ex - x, ey - burstRow) * step < R * 0.9 && (ex !== x || ey !== burstRow)) inside.push([ex, ey]);
        }
      }
      for (const [ex, ey] of shuffle(inside, rng).slice(0, 7)) {
        const events: [number, string][] = [];
        let t = burstAt + 0.9 + rng() * 0.5;
        for (let k = 0; k < 3; k++) {
          events.push([t, rng() < 0.5 ? ".95" : ".6"], [t + 0.07, "0"]);
          t += 0.16 + rng() * 0.3;
        }
        embers.push(`<rect class="c fw-ember" x="${px(ex)}" y="${py(ey)}" fill="${rng() < 0.5 ? flash : spark}" opacity="0">${discreteTimeline("opacity", "0", events, ctx)}</rect>`);
      }
    });

    // A quiet sky: a scatter of faint stars twinkling behind the show
    const stars: string[] = [];
    for (let k = 0; k < Math.round(W * 0.6); k++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * (H - 2));
      stars.push(`<rect class="c fw-star" x="${px(x)}" y="${py(y)}" style="animation-duration:${num(2.6 + rng() * 3.6)}s;animation-delay:-${num(rng() * 6)}s"/>`);
    }

    const css =
      `.fw-rk{fill:${dark ? colors.glint : colors.amber}}.fw-tail{fill:${colors.amber};fill-opacity:.55}` +
      `.fw-trail{fill-opacity:.45}` + sparkPlans(ctx) +
      `.fw-star{fill:${colors.indigo};fill-opacity:0;animation:fws 4s ease-in-out infinite}` +
      `@keyframes fws{0%,100%{fill-opacity:0}50%{fill-opacity:${dark ? ".24" : ".3"}}}`;

    return {
      css,
      body:
        `<defs>${defs.join("")}<clipPath id="fw-sky"><rect width="${right + 7}" height="${bottom + 7}"/></clipPath></defs>` +
        `<g clip-path="url(#fw-sky)">${glows.join("")}</g>${stars.join("")}` +
        `<g mask="url(#${cellMask})">${shells.join("")}${sparks.join("")}</g>${embers.join("")}${rockets.join("")}`,
    };
  },
};
