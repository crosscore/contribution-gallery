import { StreakRange, UserStats } from "../types";

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
      nodes { stargazerCount }
    }
    pullRequests { totalCount }
    issues { totalCount }
  }
}
`;

const RANGE_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestReviewContributions
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
    repositories: { totalCount: number; nodes: { stargazerCount: number }[] };
    pullRequests: { totalCount: number };
    issues: { totalCount: number };
  };
}

interface RangeData {
  user: {
    contributionsCollection: {
      totalCommitContributions: number;
      totalPullRequestReviewContributions: number;
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

/** Fetch and aggregate all-time stats for a user */
export async function fetchUserStats(username: string, token?: string): Promise<UserStats> {
  const profile = await graphql<ProfileData>(PROFILE_QUERY, { login: username }, token);
  if (!profile.user) throw new Error(`User "${username}" not found on GitHub`);

  const created = new Date(profile.user.createdAt);
  const now = new Date();

  // Collect daily counts + per-type totals over consecutive 1-year windows
  const dayCounts = new Map<string, number>();
  let totalContributions = 0;
  let commits = 0;
  let reviews = 0;

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
    reviews += collection.totalPullRequestReviewContributions;
    for (const week of collection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        dayCounts.set(day.date, day.contributionCount);
      }
    }
    from = to;
  }

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
    issues: profile.user.issues.totalCount,
    reviews,
  };
}
