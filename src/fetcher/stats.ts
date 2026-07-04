import { LanguageStat, StreakRange, UserStats } from "../types";

/**
 * All-time profile stats fetcher for the streak & trophy cards.
 *
 * The contribution calendar API only accepts ranges up to one year, so the
 * daily counts are collected in consecutive one-year windows starting at the
 * account creation date. Streaks are computed here (in CI) so the request-time
 * endpoints only need the tiny aggregated JSON, no GitHub token.
 */

const PROFILE_QUERY = `
query($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
        isFork
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
    pullRequests { totalCount }
  }
}
`;

const PRIVATE_COUNTS_QUERY = `
query($login: String!, $reviewsQuery: String!) {
  user(login: $login) {
    issues { totalCount }
  }
  search(query: $reviewsQuery, type: ISSUE) {
    issueCount
  }
}
`;

const RANGE_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
`;

interface ProfileData {
  user: {
    createdAt: string;
    followers: { totalCount: number };
    repositories: {
      totalCount: number;
      nodes: {
        stargazerCount: number;
        isFork: boolean;
        languages: {
          edges: { size: number; node: { name: string; color: string | null } }[];
        };
      }[];
    };
    pullRequests: { totalCount: number };
  };
}

interface PrivateCountsData {
  user: { issues: { totalCount: number } };
  search: { issueCount: number };
}

interface RangeData {
  user: {
    contributionsCollection: {
      totalCommitContributions: number;
      restrictedContributionsCount: number;
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

async function graphql<T>(
  query: string,
  variables: Record<string, string>,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `bearer ${token}`;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error("GitHub GraphQL returned no data");
  return json.data;
}

/** YYYY-MM-DD of the day before (UTC arithmetic on date strings) */
function prevDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD of the day after */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Fetch and aggregate all-time stats for a user.
 *
 * `privateToken` (a repo-scoped user token) is used only for the counts that
 * need private-repo visibility: the review search and the authored-issue
 * total. The calendar/profile queries stay on `token` — an anonymous viewer
 * still sees private activity as anonymised counts. Defaults to `token`.
 */
export async function fetchUserStats(
  username: string,
  token?: string,
  privateToken?: string
): Promise<UserStats> {
  const profile = await graphql<ProfileData>(PROFILE_QUERY, { login: username }, token);
  if (!profile.user) throw new Error(`User "${username}" not found on GitHub`);

  const created = new Date(profile.user.createdAt);
  const now = new Date();

  // Collect daily counts + per-type totals over consecutive 1-year windows
  const dayCounts = new Map<string, number>();
  let totalContributions = 0;
  let commits = 0;

  let from = created;
  while (from < now) {
    const to = new Date(Math.min(from.getTime() + 365 * 86_400_000, now.getTime()));
    const range = await graphql<RangeData>(
      RANGE_QUERY,
      { login: username, from: from.toISOString(), to: to.toISOString() },
      token
    );
    const collection = range.user.contributionsCollection;
    totalContributions += collection.contributionCalendar.totalContributions;
    commits += collection.totalCommitContributions + collection.restrictedContributionsCount;
    for (const week of collection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        dayCounts.set(day.date, day.contributionCount);
      }
    }
    from = to;
  }

  // Reviews and issues in private repos are invisible to an anonymous viewer
  // (they only appear anonymised inside restrictedContributionsCount, which
  // has no per-type breakdown), so both are fetched with the repo-scoped user
  // token: search finds private PRs the token can access, and issues.totalCount
  // is viewer-dependent. Search is NOT used for issues — org IP allowlists can
  // hide issues from search that totalCount still includes.
  const privateCounts = await graphql<PrivateCountsData>(
    PRIVATE_COUNTS_QUERY,
    { login: username, reviewsQuery: `is:pr reviewed-by:${username}` },
    privateToken ?? token
  );
  const reviews = privateCounts.search.issueCount;
  const issues = privateCounts.user.issues.totalCount;

  const dates = [...dayCounts.keys()].sort();

  // Longest streak: scan runs of consecutive positive days
  let longest: StreakRange = { days: 0, start: "", end: "" };
  let run = 0;
  let runStart = "";
  let prev = "";
  let firstContribution = "";
  for (const date of dates) {
    if ((dayCounts.get(date) ?? 0) > 0) {
      if (!firstContribution) firstContribution = date;
      if (run > 0 && date === nextDay(prev)) {
        run++;
      } else {
        run = 1;
        runStart = date;
      }
      prev = date;
      if (run > longest.days) longest = { days: run, start: runStart, end: date };
    } else {
      run = 0;
    }
  }

  // Current streak: walk back from the most recent day; a zero today does
  // not break a streak that was alive yesterday
  const last = dates[dates.length - 1];
  let cursor = (dayCounts.get(last) ?? 0) > 0 ? last : prevDay(last);
  const currentEnd = cursor;
  let currentDays = 0;
  let currentStart = cursor;
  while ((dayCounts.get(cursor) ?? 0) > 0) {
    currentDays++;
    currentStart = cursor;
    cursor = prevDay(cursor);
  }
  const currentStreak: StreakRange =
    currentDays > 0
      ? { days: currentDays, start: currentStart, end: currentEnd }
      : { days: 0, start: last, end: last };

  // Top languages by byte size across owned non-fork repos (forks would
  // mostly count upstream code, so they are skipped)
  const langTotals = new Map<string, { color: string | null; size: number }>();
  for (const repo of profile.user.repositories.nodes) {
    if (repo.isFork) continue;
    for (const edge of repo.languages.edges) {
      const entry = langTotals.get(edge.node.name);
      if (entry) {
        entry.size += edge.size;
      } else {
        langTotals.set(edge.node.name, { color: edge.node.color, size: edge.size });
      }
    }
  }
  const languages: LanguageStat[] = [...langTotals.entries()]
    .map(([name, { color, size }]) => ({ name, color, size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  return {
    login: username,
    generatedAt: now.toISOString(),
    totalContributions,
    firstContribution: firstContribution || profile.user.createdAt.slice(0, 10),
    currentStreak,
    longestStreak: longest.days > 0 ? longest : { days: 0, start: last, end: last },
    commits,
    followers: profile.user.followers.totalCount,
    stars: profile.user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
    repos: profile.user.repositories.totalCount,
    pullRequests: profile.user.pullRequests.totalCount,
    issues,
    reviews,
    languages,
  };
}
