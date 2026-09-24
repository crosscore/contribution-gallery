import { UserStats } from "../types";
import { DEFAULT_NUMERAL_FONT, NumeralFont } from "./numerals";
import { cardSvg, escapeXml, galleryTheme, HALF_HEIGHT, HALF_WIDTH } from "./theme";

/** GitHub language colors, adjusted only when they disappear on the surface. */
function visibleColor(color: string | null, dark: boolean, fallback: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(color?.trim() ?? "");
  if (!match) return fallback;
  const n = parseInt(match[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 255000;
  const blend = dark && brightness < .45 ? .35 : !dark && brightness > .8 ? -.3 : 0;
  return "#" + rgb.map(c => Math.round(c + ((blend > 0 ? 255 : 0) - c) * Math.abs(blend))
    .toString(16).padStart(2, "0")).join("");
}

/** Cell bars use a linear scale relative to the leading language. */
export function renderLangsSVG(stats: UserStats, dark: boolean, font: NumeralFont = DEFAULT_NUMERAL_FONT): string {
  const theme = galleryTheme(dark);
  const languages = (stats.languages ?? []).filter(l => Number.isFinite(l.size) && l.size > 0);
  const total = languages.reduce((sum, l) => sum + l.size, 0);
  const shown = [...languages].sort((a, b) => b.size - a.size).slice(0, 8);
  const max = shown[0]?.size ?? 1;
  const rows = shown.map((lang, i) => {
    const y = 82 + i * 20;
    const name = lang.name.length > 18 ? `${lang.name.slice(0, 17)}…` : lang.name;
    const color = visibleColor(lang.color, dark, theme.muted);
    const filled = Math.max(1, Math.round(lang.size / max * 26));
    const cells = Array.from({ length: 26 }, (_, col) =>
      `<rect x="${148 + col * 5.5}" y="${y - 6}" width="4" height="5" rx="1" fill="${col < filled ? color : theme.inset}"${col < filled ? ` class="language-cell" style="animation-delay:-${(col * .1 + i * .3).toFixed(1)}s"` : ""}/>`
    ).join("");
    return `<g><title>${escapeXml(lang.name)}</title>
      <text x="24" y="${y}" font-size="11.5" fill="${theme.text}">${escapeXml(name)}</text>
      ${cells}
      <text class="detail numeric-detail" x="351" y="${y}" text-anchor="end" style="font-variant-numeric:tabular-nums">${(lang.size / total * 100).toFixed(1)}%</text>
    </g>`;
  }).join("\n");
  const summary = shown.length ? shown.map(l => `${l.name} ${(l.size / total * 100).toFixed(1)}%`).join(", ") : "No language data yet";

  return cardSvg("Language composition", `${summary}. Shares of indexed code by byte size.`, HALF_WIDTH, HALF_HEIGHT, theme, `
    <text class="eyebrow" x="24" y="29">CODE COMPOSITION</text>
    <text class="heading" x="24" y="54">Top Languages</text>
    ${shown.slice(0, 4).map((lang, i) => `<rect x="${334 + (i % 2) * 9}" y="${28 + Math.floor(i / 2) * 9}" width="6" height="6" rx="1.5" fill="${visibleColor(lang.color, dark, theme.muted)}"/>`).join("")}
    ${rows || `<text class="label" x="24" y="123">No language data yet.</text>`}
    <text class="detail" x="24" y="243">Relative bars · % of indexed code</text>`, `.language-cell{animation:language-wave 4.8s ease-in-out infinite}@keyframes language-wave{0%,60%,100%{opacity:.78}80%{opacity:1}}@media(prefers-reduced-motion:reduce){.language-cell{animation:none}}`, font);
}
