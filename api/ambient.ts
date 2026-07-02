import { renderAmbientSVG } from "../src/renderer/ambient";
import {
  DEFAULT_RENDER_CONFIG,
  DEFAULT_DARK_PALETTE,
  DEFAULT_LIGHT_PALETTE,
  Grid,
  RenderConfig,
} from "../src/types";

/**
 * Serverless endpoint (Vercel /api function): renders the ambient SVG with
 * a fresh random seed on EVERY request, so each README view gets a newly
 * shuffled scene order and fresh scene details.
 *
 * Contribution data comes from docs/grid.json in this repo (regenerated
 * daily by CI), fetched over raw.githubusercontent — no GitHub token is
 * needed at request time. Override the source with the GRID_URL env var.
 *
 * Query params:
 *   theme=dark|light   palette selection (default: light)
 *
 * Cache-Control is no-store so GitHub's camo proxy re-fetches per view
 * instead of serving a cached copy.
 */

const GRID_URL =
  process.env.GRID_URL ??
  "https://raw.githubusercontent.com/crosscore/contribution-gallery/main/docs/grid.json";

/** Warm-invocation cache; raw.githubusercontent itself caches ~5 min */
const GRID_TTL_MS = 5 * 60 * 1000;
let cachedGrid: Grid | null = null;
let cachedAt = 0;

async function loadGrid(): Promise<Grid> {
  const now = Date.now();
  if (cachedGrid && now - cachedAt < GRID_TTL_MS) return cachedGrid;
  try {
    const response = await fetch(GRID_URL);
    if (!response.ok) {
      throw new Error(`grid fetch failed: ${response.status}`);
    }
    cachedGrid = (await response.json()) as Grid;
    cachedAt = now;
    return cachedGrid;
  } catch (err) {
    // Serve the stale grid if we have one; the next request retries
    if (cachedGrid) return cachedGrid;
    throw err;
  }
}

/** Minimal req/res shapes so this compiles without @vercel/node types */
interface ApiRequest {
  url?: string;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");

  let grid: Grid;
  try {
    grid = await loadGrid();
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("contribution grid data unavailable");
    return;
  }

  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const dark = query.get("theme") === "dark";
  const config: RenderConfig = {
    ...DEFAULT_RENDER_CONFIG,
    darkMode: dark,
    palette: dark ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE,
  };
  const seed = Math.floor(Math.random() * 0x100000000);

  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.end(renderAmbientSVG(grid, config, seed));
}
