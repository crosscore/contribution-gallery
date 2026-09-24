import { Grid, RenderConfig, DEFAULT_RENDER_CONFIG } from "../types";
import { cardSurface, galleryCss, galleryTheme, GalleryTheme } from "./theme";
import {
  DARK_SPECTRUM,
  LIGHT_SPECTRUM,
  mulberry32,
  num,
  frac,
  SCENES,
  SCENE_SECONDS,
  SceneContext,
  shuffle,
} from "./scenes";

/**
 * Ambient renderer — a rotating gallery of nine cell-based scenes played
 * on top of the real contribution graph: Plasma, Constellation, Tide,
 * Code Rain, Pathfinder, Life, Sort, Pong and Heartbeat (src/renderer/scenes).
 *
 * Continuous scenes are CSS keyframe loops where each cell only carries a
 * phase offset; story scenes run a one-shot script inside their window
 * with shared story keyframes or compact discrete SMIL timelines. A
 * blurred <use> copy of the scene layer gives lit cells a soft bloom at
 * no file-size cost.
 *
 * Timeline: SCENES.length × SCENE_SECONDS on one master cycle. Scene groups
 * crossfade with eased SMIL opacity envelopes, a placard names each piece,
 * and a segmented progress bar fills in each scene's signature hue. The
 * scene order and every random detail are shuffled by `seed`.
 *
 * Constraint reminder: this SVG is served through GitHub's camo proxy
 * inside an <img>, so only SMIL/CSS animations work — no JS, no external
 * resources, no interactivity.
 */

const FADE_SECONDS = 2.2;
const LABEL_FADE = 0.35;
const MARGIN = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Opacity envelope for a window [t0, t1] on the master cycle: 0 → 1 over
 * `fadeIn`, 1 → 0 over `fadeOut`. The first window wraps around the cycle
 * end and the last window ends exactly at it, so neighbours crossfade.
 */
function windowPoints(
  fadeIn: [number, number],
  fadeOut: [number, number],
  cycle: number
): [number, number][] {
  if (fadeIn[0] <= 0) {
    return [[0, 1], [fadeOut[0], 1], [fadeOut[1], 0], [cycle + fadeIn[0], 0], [cycle, 1]];
  }
  if (fadeOut[1] >= cycle) {
    return [[0, 0], [fadeIn[0], 0], [fadeIn[1], 1], [Math.min(fadeOut[0], cycle), 1], [cycle, 0]];
  }
  return [[0, 0], [fadeIn[0], 0], [fadeIn[1], 1], [fadeOut[0], 1], [fadeOut[1], 0], [cycle, 0]];
}

/** One eased SMIL opacity animation from a piecewise-linear envelope */
function envelope(points: [number, number][], cycle: number): string {
  const values = points.map((p) => num(p[1])).join(";");
  const keyTimes = points.map((p) => frac(p[0], cycle)).join(";");
  const splines = points
    .slice(1)
    .map((p, i) => (p[1] === points[i][1] ? "0 0 1 1" : ".45 0 .25 1"))
    .join(";");
  return `<animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" keySplines="${splines}" calcMode="spline" dur="${cycle}s" repeatCount="indefinite"/>`;
}

/** Month labels above the columns where a new month begins */
function monthLabels(grid: Grid, cellX: (x: number) => number, y: number): string {
  const starts = grid.weekStarts;
  if (!starts || starts.length !== grid.width) return "";
  const marks: { x: number; label: string }[] = [];
  let previous = -1;
  for (let x = 0; x < grid.width; x++) {
    const month = Number(starts[x]?.slice(5, 7));
    if (!MONTHS[month - 1]) continue;
    if (month !== previous) {
      marks.push({ x, label: MONTHS[month - 1] });
      previous = month;
    }
  }
  return marks
    .filter((m, i) => {
      const next = marks[i + 1];
      return (!next || next.x - m.x >= 3) && grid.width - m.x >= 3;
    })
    .map((m) => `<text class="month" x="${cellX(m.x)}" y="${y}">${m.label}</text>`)
    .join("");
}

/** "SEP 2025 — AUG 2026" from the first and last week, when the grid carries dates */
function dateRange(grid: Grid): string {
  const starts = grid.weekStarts;
  if (!starts?.length) return "";
  const label = (date: string | undefined) => {
    const month = MONTHS[Number(date?.slice(5, 7)) - 1];
    return month && date ? `${month.toUpperCase()} ${date.slice(0, 4)}` : "";
  };
  const first = label(starts[0]);
  const last = label(starts[starts.length - 1]);
  return first && last ? `${first} — ${last}` : "";
}

/**
 * One-shot fade-in: holds at 0 for `delay`, then rises to 1 and freezes.
 * The target keeps opacity 1 as its base value, so a still render or a
 * viewer without SMIL shows it in full.
 */
function reveal(delay: number, rise: number): string {
  const dur = delay + rise;
  const values = delay > 0 ? "0;0;1" : "0;1";
  const keyTimes = delay > 0 ? `0;${(delay / dur).toFixed(4)};1` : "0;1";
  const splines = delay > 0 ? "0 0 1 1;.2 .6 .2 1" : ".2 .6 .2 1";
  return `<animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" keySplines="${splines}" calcMode="spline" dur="${num(dur)}s" fill="freeze"/>`;
}

/** Segment width tween: empty until its window, full after it, reset at the cycle start */
function progressFill(i: number, count: number, width: number, cycle: number): string {
  const t0 = frac(i * SCENE_SECONDS, cycle);
  const t1 = frac((i + 1) * SCENE_SECONDS, cycle);
  const w = num(width);
  const [values, keyTimes] =
    i === 0 ? [`0;${w};${w}`, `0;${t1};1`]
      : i === count - 1 ? [`0;0;${w}`, `0;${t0};1`]
        : [`0;0;${w};${w}`, `0;${t0};${t1};1`];
  return `<animate attributeName="width" values="${values}" keyTimes="${keyTimes}" dur="${cycle}s" repeatCount="indefinite"/>`;
}

/**
 * Render the ambient multi-scene SVG.
 *
 * @param seed Integer that shuffles the scene order and drives all seeded
 *             randomness. Pass days-since-epoch for a daily-changing SVG.
 */
export function renderAmbientSVG(
  grid: Grid,
  config: RenderConfig = DEFAULT_RENDER_CONFIG,
  seed: number = 0
): string {
  const { cellSize, cellGap, cellRadius } = config;
  const theme: GalleryTheme = galleryTheme(config.darkMode);
  const colors = config.darkMode ? DARK_SPECTRUM : LIGHT_SPECTRUM;
  const step = cellSize + cellGap;
  const svgWidth = grid.width * step - cellGap + MARGIN * 2;
  const svgHeight = grid.height * step - cellGap + MARGIN * 2;
  const graphWidth = svgWidth - MARGIN * 2;
  const graphHeight = svgHeight - MARGIN * 2;
  const scale = (svgWidth - 48) / graphWidth;
  const months = monthLabels(grid, (x) => Math.round((24 + x * step * scale) * 10) / 10, 86);
  const graphY = months ? 99 : 88;
  const cardHeight = Math.ceil(graphY + graphHeight * scale + 45);
  const footerY = cardHeight - 19;
  const cycle = SCENES.length * SCENE_SECONDS;
  const spectrum = [colors.mint, colors.sky, colors.violet];
  // Light glows read as haze on a white card, so the bloom is tighter and fainter there
  const bloom = config.darkMode ? { blur: 4, alpha: 1.5, opacity: 0.7 } : { blur: 3, alpha: 1.2, opacity: 0.4 };

  // Shuffle the scene order on its own PRNG stream so the scene-detail
  // randomness below stays independent of the ordering
  const ordered = shuffle(SCENES, mulberry32((seed ^ 0x9e3779b9) >>> 0));
  const rng = mulberry32((seed ^ 0x02f6e2b1) >>> 0);
  const px = (x: number) => MARGIN + x * step;
  const py = (y: number) => MARGIN + y * step;

  // Static base: the real contribution graph, always visible underneath.
  // Columns reveal left to right once on load via SMIL, so renderers that
  // draw a still frame (no SMIL, no CSS animation) still show every cell.
  const columns: string[] = [];
  let activeDays = 0;
  for (let x = 0; x < grid.width; x++) {
    const rects: string[] = [];
    for (let y = 0; y < grid.height; y++) {
      const lvl = grid.cells[x][y].contributionLevel;
      if (lvl > 0) activeDays++;
      rects.push(`<rect class="c b" x="${px(x)}" y="${py(y)}" fill="${config.palette.contributionColors[lvl]}"/>`);
    }
    columns.push(`<g>${reveal(x * 0.02, 0.8)}${rects.join("")}</g>`);
  }

  const cssBlocks: string[] = [
    galleryCss(theme),
    `.c{width:${cellSize}px;height:${cellSize}px;rx:${cellRadius}px}` +
      `.month{font-size:9.5px;letter-spacing:.3px;fill:${theme.muted};opacity:.9}` +
      `.stat{font-size:21px;font-weight:600;letter-spacing:-.5px;fill:${theme.text};font-variant-numeric:tabular-nums}` +
      `.stat-label{font-size:11.5px;font-weight:400;letter-spacing:0;fill:${theme.muted}}` +
      `.plate-no{font-size:10px;font-weight:700;letter-spacing:1.2px;font-variant-numeric:tabular-nums}` +
      `.plate-title{font-size:12px;font-weight:600;fill:${theme.text}}` +
      `.plate-caption{font-size:11px;fill:${theme.muted}}`,
  ];

  const windows = ordered.map((_, i) => {
    const t0 = i * SCENE_SECONDS;
    const t1 = t0 + SCENE_SECONDS;
    return {
      scene: envelope(windowPoints([t0 - FADE_SECONDS, t0], [t1 - FADE_SECONDS, t1], cycle), cycle),
      label: envelope(windowPoints([t0 - LABEL_FADE, t0 + LABEL_FADE], [t1 - LABEL_FADE, t1 + LABEL_FADE], cycle), cycle),
    };
  });

  const veils: string[] = [];
  const groups = ordered.map((scene, i) => {
    const ctx: SceneContext = {
      grid,
      dark: config.darkMode,
      colors,
      rng,
      px,
      py,
      cell: cellSize,
      step,
      radius: cellRadius,
      cycle,
      start: i * SCENE_SECONDS,
      cellMask: "cell-mask",
    };
    const { css, body } = scene.build(ctx);
    if (css) cssBlocks.push(css);
    if (scene.dim > 0) {
      veils.push(
        `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${theme.background}" fill-opacity="${num(scene.dim)}" opacity="0">${windows[i].scene}</rect>`
      );
    }
    // First scene stays visible if SMIL is unsupported (static fallback)
    return `<g data-scene="${scene.id}" opacity="${i === 0 ? 1 : 0}">${windows[i].scene}${body}</g>`;
  });

  // Footer: a gallery placard per scene, and a progress bar whose segments
  // fill in each scene's signature hue
  const segment = { width: 13, gap: 3, height: 3 };
  const barRight = svgWidth - 24;
  const segX = (i: number) => barRight - (ordered.length - i) * segment.width - (ordered.length - 1 - i) * segment.gap;
  const barY = footerY - 5;
  const progress = ordered.map((scene, i) =>
    `<rect x="${num(segX(i))}" y="${barY}" width="${segment.width}" height="${segment.height}" rx="1.5" fill="${theme.border}"/>` +
    `<rect x="${num(segX(i))}" y="${barY}" width="0" height="${segment.height}" rx="1.5" fill="${colors[scene.hue]}">${progressFill(i, ordered.length, segment.width, cycle)}</rect>`
  ).join("");
  const plates = ordered.map((scene, i) =>
    `<g opacity="${i === 0 ? 1 : 0}">${windows[i].label}` +
    `<text x="24" y="${footerY}"><tspan class="plate-no" fill="${colors[scene.hue]}">${String(i + 1).padStart(2, "0")}</tspan>` +
    `<tspan class="plate-title" dx="9">${scene.title}</tspan><tspan class="plate-caption" dx="8">${scene.caption}</tspan></text></g>`
  ).join("");
  const legend = config.palette.contributionColors.map((color, i) =>
    `<rect x="${barRight - 30 - (5 - i) * 13}" y="${footerY - 8.5}" width="10" height="10" rx="2" fill="${color}"/>`
  ).join("");
  cssBlocks.push(`.still{display:none}@media(prefers-reduced-motion:reduce){.ambient-scenes,.scene-labels{display:none}.still{display:inline}.c{animation:none!important}}`);

  const range = dateRange(grid);
  const heading = config.darkMode ? "#5865bc" : "#9db7ff";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${cardHeight}" width="${svgWidth}" height="${cardHeight}" role="img" aria-labelledby="title description" data-design="gallery-v4">
  <title id="title">A year, in motion — contribution gallery</title>
  <desc id="description">Contribution graph ambient animation — ${ordered.map((s) => s.title).join(" → ")}, one scene every ${SCENE_SECONDS} seconds. ${activeDays} active days. Reduced motion shows the original contribution graph.</desc>
  <!-- generated by contribution-gallery ambient renderer (seed ${seed}) -->
  <style>${cssBlocks.join("\n")}</style>
  ${cardSurface(svgWidth, cardHeight, theme)}
  <defs>
    <linearGradient id="spectrum"><stop stop-color="${spectrum[0]}"/><stop offset=".5" stop-color="${spectrum[1]}"/><stop offset="1" stop-color="${spectrum[2]}"/></linearGradient>
    <radialGradient id="atmosphere" cx="80%" cy="0%" r="90%"><stop stop-color="${heading}" stop-opacity=".16"/><stop offset="1" stop-color="${theme.background}" stop-opacity="0"/>
      <animate attributeName="cx" values="80%;58%;80%" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" calcMode="spline" dur="46s" repeatCount="indefinite"/>
    </radialGradient>
    <filter id="bloom" x="-2%" y="-12%" width="104%" height="124%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="${bloom.blur}"/>
      <feComponentTransfer><feFuncA type="linear" slope="${bloom.alpha}"/></feComponentTransfer>
    </filter>
    <pattern id="cell-tile" patternUnits="userSpaceOnUse" x="${MARGIN}" y="${MARGIN}" width="${step}" height="${step}"><rect width="${cellSize}" height="${cellSize}" rx="${cellRadius}" fill="#fff"/></pattern>
    <mask id="cell-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${svgWidth}" height="${svgHeight}"><rect x="${MARGIN}" y="${MARGIN}" width="${graphWidth}" height="${graphHeight}" fill="url(#cell-tile)"/></mask>
  </defs>
  <rect x="1" y="1" width="${svgWidth - 2}" height="${cardHeight - 2}" rx="14" fill="url(#atmosphere)"/>
  <text class="eyebrow" x="24" y="29">CONTRIBUTION GALLERY</text>
  <text class="heading" x="23" y="60" style="font-size:27px;letter-spacing:-.8px;fill:url(#spectrum)">A year, in motion.</text>
  ${range ? `<text class="eyebrow" x="${svgWidth - 24}" y="29" text-anchor="end">${range}</text>` : ""}
  <text x="${svgWidth - 24}" y="59" text-anchor="end"><tspan class="stat">${activeDays}</tspan><tspan class="stat-label" dx="6">active days</tspan></text>
  ${months}
  <g transform="translate(${24 - MARGIN * scale},${graphY - MARGIN * scale}) scale(${scale})">
    <g>${columns.join("\n    ")}</g>
    <g class="ambient-scenes">${reveal(0.5, 1.8)}
    <g class="veils">${veils.join("\n    ")}</g>
    <use href="#scenes" filter="url(#bloom)" opacity="${num(bloom.opacity)}"/>
    <g id="scenes">${groups.join("\n")}</g>
    </g>
  </g>
  <g class="scene-labels">${plates}${progress}</g>
  <g class="still"><text class="detail" x="24" y="${footerY}">${grid.width} weeks of contributions</text>
  <text class="detail" x="${barRight - 30 - 5 * 13 - 6}" y="${footerY}" text-anchor="end">Less</text>${legend}<text class="detail" x="${barRight}" y="${footerY}" text-anchor="end">More</text></g>
</svg>
`;
}
