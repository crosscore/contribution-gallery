import { num, Scene } from "./kit";

/** One beat, as the row of the trace in each column (0 = top row) */
const BEAT = [4, 4, 3, 3, 4, 4, 5, 0, 6, 4, 4, 3, 3, 4];

/**
 * Heartbeat — an ECG trace sweeps across the year like a bedside monitor.
 * The beam leaves a persistent phosphor line that slowly dims, and a
 * short blank gap runs just ahead of the beam, erasing the previous sweep.
 */
export const heartbeat: Scene = {
  id: "heartbeat",
  title: "Heartbeat",
  caption: "A steady pulse, traced week by week like a bedside monitor",
  hue: "rose",
  dim: 0.62,
  build({ grid, colors, dark, rng, px, py }) {
    const W = grid.width;
    const H = grid.height;
    const perColumn = 0.075;
    const period = W * perColumn + 0.35;
    const head = dark ? colors.glint : "#881337";
    const line = colors.rose;
    const baseline = Math.min(4, H - 1);

    // Trace rows per column: flat baseline with a beat every 12–15 columns
    const trace: number[] = [];
    let x = Math.floor(rng() * 5);
    for (let i = 0; i < x; i++) trace.push(baseline);
    while (trace.length < W) {
      for (const row of BEAT) trace.push(Math.min(row, H - 1));
      const rest = Math.floor(rng() * 3);
      for (let i = 0; i < rest; i++) trace.push(baseline);
    }

    const parts: string[] = [];
    for (x = 0; x < W; x++) {
      const prev = x > 0 ? trace[x - 1] : trace[0];
      const row = trace[x];
      // A stroke fills the cells between the previous row (exclusive) and
      // this one, lit in drawing order so spikes streak up or down
      const dir = row === prev ? 0 : row > prev ? 1 : -1;
      const rows = dir === 0 ? [row] : Array.from({ length: Math.abs(row - prev) }, (_, i) => prev + dir * (i + 1));
      rows.forEach((y, i) => {
        const at = x * perColumn + (i * perColumn) / Math.max(rows.length, 1);
        parts.push(`<rect class="c hb" x="${px(x)}" y="${py(y)}" style="--d:-${num(period - at)}s"/>`);
      });
    }

    const css =
      `.hb{fill:${line};fill-opacity:0;animation:hb ${num(period)}s linear infinite var(--d)}` +
      `@keyframes hb{0%{fill:${head};fill-opacity:1}4%{fill:${line};fill-opacity:1}30%{fill-opacity:.8}84%{fill-opacity:.34}88%,100%{fill-opacity:0}}`;

    return { css, body: parts.join("") };
  },
};
