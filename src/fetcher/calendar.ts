import { githubGraphQL, isResourceLimited } from "./graphql";

/**
 * Windowed contribution-calendar fetcher.
 *
 * GitHub rejects calendar queries whose aggregated contribution volume is too
 * large with RESOURCE_LIMITS_EXCEEDED (observed around ~4k+ contributions per
 * window for this account). When that happens the requested range is split in
 * half recursively until each window fits, so any activity level works.
 *
 * Range boundaries are dates (whole days, UTC). A window [from, to] includes
 * both boundary dates in full, so consecutive windows must start the day
 * after the previous window's `to` to avoid double counting.
 */

const CALENDAR_RANGE_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
          }
        }
      }
    }
  }
}
`;

/**
 * Single-field fallback queries for a day so busy that anything more trips
 * the resource limit. The limit accounting is cumulative per query — for the
 * observed ~3k-contribution day even TWO aggregate fields together exceed it,
 * while each field alone resolves. For a one-day window
 * contributionCalendar.totalContributions IS that day's count.
 */
const DAY_TOTAL_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions }
    }
  }
}
`;

const DAY_COMMITS_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
    }
  }
}
`;

const DAY_RESTRICTED_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
    }
  }
}
`;

export interface CalendarDay {
  date: string;
  weekday: number;
  contributionCount: number;
}

export interface CalendarRange {
  days: CalendarDay[];
  totalContributions: number;
  totalCommitContributions: number;
  restrictedContributionsCount: number;
}

interface RangeData {
  user: {
    contributionsCollection: {
      totalCommitContributions: number;
      restrictedContributionsCount: number;
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: CalendarDay[] }[];
      };
    };
  } | null;
}

interface DayTotalData {
  user: {
    contributionsCollection: { contributionCalendar: { totalContributions: number } };
  } | null;
}

interface DayCommitsData {
  user: { contributionsCollection: { totalCommitContributions: number } } | null;
}

interface DayRestrictedData {
  user: { contributionsCollection: { restrictedContributionsCount: number } } | null;
}

const DAY_MS = 86_400_000;

/** Pause between split sub-requests to stay clear of secondary rate limits */
const PACE_MS = 1_000;

function pace(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PACE_MS));
}

/** YYYY-MM-DD shifted by a number of days (UTC arithmetic) */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS
  );
}

/**
 * Fetch the contribution calendar for [from, to] (inclusive dates,
 * YYYY-MM-DD), splitting the range whenever GitHub's resource limit is hit.
 */
export async function fetchCalendarRange(
  username: string,
  from: string,
  to: string,
  token?: string
): Promise<CalendarRange> {
  try {
    const data = await githubGraphQL<RangeData>(
      CALENDAR_RANGE_QUERY,
      { login: username, from: `${from}T00:00:00Z`, to: `${to}T00:00:00Z` },
      token
    );
    if (!data.user) {
      throw new Error(`User "${username}" not found on GitHub`);
    }
    const collection = data.user.contributionsCollection;
    return {
      days: collection.contributionCalendar.weeks.flatMap(
        (w) => w.contributionDays
      ),
      totalContributions: collection.contributionCalendar.totalContributions,
      totalCommitContributions: collection.totalCommitContributions,
      restrictedContributionsCount: collection.restrictedContributionsCount,
    };
  } catch (error) {
    if (!isResourceLimited(error)) throw error;

    const span = daysBetween(from, to);
    if (span < 1) return fetchSingleDayTotal(username, from, token);

    const mid = addDays(from, Math.floor(span / 2));
    console.error(
      `Calendar window ${from}..${to} exceeds GitHub resource limits, splitting at ${mid}...`
    );
    await pace();
    const left = await fetchCalendarRange(username, from, mid, token);
    await pace();
    const right = await fetchCalendarRange(username, addDays(mid, 1), to, token);
    return {
      days: [...left.days, ...right.days],
      totalContributions: left.totalContributions + right.totalContributions,
      totalCommitContributions:
        left.totalCommitContributions + right.totalCommitContributions,
      restrictedContributionsCount:
        left.restrictedContributionsCount + right.restrictedContributionsCount,
    };
  }
}

/**
 * Last resort for a day so busy that even its one-day `weeks` breakdown trips
 * the resource limit: read each aggregate in its own query (together they
 * would exceed the limit too) and synthesize the single CalendarDay.
 */
async function fetchSingleDayTotal(
  username: string,
  date: string,
  token?: string
): Promise<CalendarRange> {
  console.error(
    `Single day ${date} still exceeds resource limits, falling back to aggregate totals...`
  );
  const variables = {
    login: username,
    from: `${date}T00:00:00Z`,
    to: `${date}T00:00:00Z`,
  };

  const total = await githubGraphQL<DayTotalData>(DAY_TOTAL_QUERY, variables, token);
  await pace();
  const commits = await githubGraphQL<DayCommitsData>(DAY_COMMITS_QUERY, variables, token);
  await pace();
  const restricted = await githubGraphQL<DayRestrictedData>(
    DAY_RESTRICTED_QUERY,
    variables,
    token
  );
  if (!total.user || !commits.user || !restricted.user) {
    throw new Error(`User "${username}" not found on GitHub`);
  }

  const count =
    total.user.contributionsCollection.contributionCalendar.totalContributions;
  const [y, m, d] = date.split("-").map(Number);
  return {
    days: [
      {
        date,
        weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
        contributionCount: count,
      },
    ],
    totalContributions: count,
    totalCommitContributions:
      commits.user.contributionsCollection.totalCommitContributions,
    restrictedContributionsCount:
      restricted.user.contributionsCollection.restrictedContributionsCount,
  };
}
