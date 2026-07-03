import { renderTrophySVG } from "../src/renderer/trophy";
import { UserStats } from "../src/types";

/**
 * Serverless endpoint (Vercel /api function): renders the trophy card from
 * docs/stats.json (regenerated daily by CI) — no GitHub token needed at
 * request time. Same data-loading pattern as /api/ambient.
 *
 * Query params:
 *   theme=dark|light   palette selection (default: light)
 */

const STATS_URL =
  process.env.STATS_URL ??
  "https://raw.githubusercontent.com/crosscore/contribution-gallery/main/docs/stats.json";

/** Warm-invocation cache; raw.githubusercontent itself caches ~5 min */
const STATS_TTL_MS = 5 * 60 * 1000;
let cachedStats: UserStats | null = null;
let cachedAt = 0;

async function loadStats(): Promise<UserStats> {
  const now = Date.now();
  if (cachedStats && now - cachedAt < STATS_TTL_MS) return cachedStats;
  try {
    const response = await fetch(STATS_URL);
    if (!response.ok) {
      throw new Error(`stats fetch failed: ${response.status}`);
    }
    cachedStats = (await response.json()) as UserStats;
    cachedAt = now;
    return cachedStats;
  } catch (err) {
    if (cachedStats) return cachedStats;
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

  let stats: UserStats;
  try {
    stats = await loadStats();
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("profile stats data unavailable");
    return;
  }

  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const dark = query.get("theme") === "dark";

  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.end(renderTrophySVG(stats, dark));
}
