import { Hue, num, Scene } from "./kit";

interface Ribbon {
  /** Resting height of the ribbon's lower edge, 0 = top row, 1 = bottom row */
  base: number;
  amp: number;
  thick: number;
  /** Lower edge → upper fringe */
  hues: [Hue, Hue, Hue];
  strength: number;
  seconds: number;
}

const EASE = ".45 0 .55 1";

/**
 * Aurora — curtains of light drift over the year. Three soft ribbons
 * undulate and morph on slow, unrelated periods, bright at their lower
 * hem and fading upward through violet. Vertical rays shimmer through the
 * curtains as two striped veils slide past each other, and faint stars
 * twinkle in the clear sky above.
 */
export const aurora: Scene = {
  id: "aurora",
  title: "Aurora",
  caption: "Curtains of light drifting over the year",
  hue: "emerald",
  dim: 0.76,
  build({ grid, colors, dark, rng, px, py, cell, cellTile }) {
    const W = grid.width;
    const H = grid.height;
    const left = px(0) - 40;
    const right = px(W - 1) + cell + 40;
    const top = py(0);
    const height = py(H - 1) + cell - top;
    const lattice = px(W - 1) + cell - px(0);

    const ribbons: Ribbon[] = [
      { base: 0.74, amp: 0.24, thick: 0.46, hues: ["emerald", "mint", "violet"], strength: 1, seconds: 17 },
      { base: 0.42, amp: 0.26, thick: 0.36, hues: ["mint", "sky", "pink"], strength: 0.85, seconds: 23 },
      { base: 1.02, amp: 0.12, thick: 0.4, hues: ["lime", "emerald", "indigo"], strength: 0.55, seconds: 29 },
    ];

    // One ribbon outline at phase φ: a wavy lower hem and a ragged upper fringe
    const outline = (r: Ribbon, k: [number, number, number], phi: number) => {
      const hem: string[] = [];
      const fringe: string[] = [];
      for (let x = left; x <= right + 1; x += 24) {
        const u = x / 100;
        const y = top + height * (r.base + r.amp * Math.sin(k[0] * u + phi) + r.amp * 0.5 * Math.sin(k[1] * u - phi * 1.6));
        const t = height * r.thick * (0.65 + 0.35 * Math.sin(k[2] * u + phi * 2.3));
        hem.push(`${num(x)} ${num(y)}`);
        fringe.push(`${num(x)} ${num(y - t)}`);
      }
      return `M${hem.join("L")}L${fringe.reverse().join("L")}Z`;
    };

    const defs: string[] = [];
    const paths = ribbons.map((r, i) => {
      const k: [number, number, number] = [0.9 + rng() * 0.6, 1.9 + rng() * 0.9, 2.6 + rng() * 1.4];
      const phi = rng() * Math.PI * 2;
      const shapes = [0, 2.1, 4.2].map((d) => outline(r, k, phi + d));
      const [hem, mid, fringe] = r.hues.map((h) => colors[h]);
      defs.push(
        `<linearGradient id="ar-g${i}" x1="0" y1="1" x2="0" y2="0">` +
          `<stop stop-color="${hem}" stop-opacity="0"/><stop offset=".08" stop-color="${dark ? colors.glint : hem}" stop-opacity=".9"/>` +
          `<stop offset=".2" stop-color="${hem}"/><stop offset=".5" stop-color="${mid}" stop-opacity=".8"/>` +
          `<stop offset=".8" stop-color="${fringe}" stop-opacity=".45"/><stop offset="1" stop-color="${fringe}" stop-opacity="0"/></linearGradient>`
      );
      const drift = num(18 + rng() * 26);
      return `<path d="${shapes[0]}" fill="url(#ar-g${i})" opacity="${r.strength}">` +
        `<animate attributeName="d" values="${[...shapes, shapes[0]].join(";")}" keyTimes="0;.33;.67;1" calcMode="spline" keySplines="${EASE};${EASE};${EASE}" dur="${r.seconds}s" repeatCount="indefinite"/>` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;-${drift} 0;0 0" keyTimes="0;.5;1" calcMode="spline" keySplines="${EASE};${EASE}" dur="${num(r.seconds * 0.7)}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${r.strength};${num(r.strength * 0.55)};${r.strength}" keyTimes="0;.5;1" calcMode="spline" keySplines="${EASE};${EASE}" dur="${num(5 + rng() * 4)}s" repeatCount="indefinite"/>` +
        `</path>`;
    });

    // The curtains show through their own copy of the cell lattice, darkened
    // by two veils of vertical stripes that slide past each other, so light
    // seems to stream down through the curtains in rays
    const veil = (id: string, period: number, seconds: number, dir: 1 | -1) => {
      const stops = Array.from({ length: 7 }, (_, s) =>
        `<stop offset="${num(s / 6)}" stop-opacity="${s === 0 || s === 6 ? ".05" : num(0.05 + rng() * 0.38)}"/>`).join("");
      return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${period}" y2="0" spreadMethod="repeat">${stops}` +
        `<animateTransform attributeName="gradientTransform" type="translate" values="0 0;${dir * period} 0" dur="${seconds}s" repeatCount="indefinite"/></linearGradient>`;
    };
    defs.push(veil("ar-r1", 92, 9, 1), veil("ar-r2", 57, 13, -1));
    defs.push(
      `<filter id="ar-soft" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3.5 2"/></filter>` +
        `<mask id="ar-mask" maskUnits="userSpaceOnUse" x="${px(0)}" y="${top}" width="${lattice}" height="${height}">` +
        [`url(#${cellTile})`, "url(#ar-r1)", "url(#ar-r2)"].map((fill) => `<rect x="${px(0)}" y="${top}" width="${lattice}" height="${height}" fill="${fill}"/>`).join("") +
        `</mask>`
    );

    // Stars in the upper rows, outshone wherever a curtain passes
    const stars: string[] = [];
    for (let s = 0; s < Math.round(W * 0.7); s++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * 3);
      stars.push(`<rect class="c ar-star" x="${px(x)}" y="${py(y)}" style="animation-duration:${num(2.4 + rng() * 3.5)}s;animation-delay:-${num(rng() * 6)}s"/>`);
    }

    const css =
      `.ar-star{fill:${dark ? colors.glint : colors.indigo};fill-opacity:0;animation:ars 4s ease-in-out infinite}` +
      `@keyframes ars{0%,100%{fill-opacity:0}50%{fill-opacity:${dark ? ".3" : ".22"}}}`;

    return {
      css,
      body: `<defs>${defs.join("")}</defs>${stars.join("")}` +
        `<g mask="url(#ar-mask)"><g filter="url(#ar-soft)">${paths.join("")}</g></g>`,
    };
  },
};
