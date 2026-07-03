import * as fs from "fs";
import * as path from "path";
import { fetchUserStats } from "./fetcher/stats";

/**
 * CLI: fetch all-time profile stats and write docs/stats.json.
 * Run daily by CI; the streak & trophy card endpoints read the output.
 *
 * Usage:
 *   npx tsx src/cli-stats.ts --user <github_username> [--token <token>] [--output docs/stats.json]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const username = getArg("--user");
  const token = getArg("--token") || process.env.GITHUB_TOKEN;
  const outputPath = getArg("--output") || "docs/stats.json";

  if (!username) {
    console.error("Usage: npx tsx src/cli-stats.ts --user <username> [--token <token>] [--output docs/stats.json]");
    process.exit(1);
  }

  console.log(`📈 Fetching all-time stats for ${username}...`);
  const stats = await fetchUserStats(username, token);

  const dir = path.dirname(outputPath);
  if (dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(stats, null, 2) + "\n", "utf-8");

  console.log(`   Total contributions: ${stats.totalContributions} (since ${stats.firstContribution})`);
  console.log(`   Current streak: ${stats.currentStreak.days} days, longest: ${stats.longestStreak.days} days`);
  console.log(`   Commits ${stats.commits} / Followers ${stats.followers} / Stars ${stats.stars} / Repos ${stats.repos}`);
  console.log(`   PRs ${stats.pullRequests} / Issues ${stats.issues} / Reviews ${stats.reviews}`);
  console.log(`   Top languages: ${stats.languages.slice(0, 5).map((l) => l.name).join(", ")}`);
  console.log(`📁 Saved: ${outputPath}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
