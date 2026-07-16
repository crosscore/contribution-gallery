import { Cell, CellOwner, ContributionLevel, Grid } from "../types";
import { githubGraphQL, isResourceLimited } from "./graphql";
import { addDays, fetchCalendarRange, CalendarDay } from "./calendar";

/** GraphQL query to fetch contribution calendar */
const CONTRIBUTION_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            weekday
            color
          }
        }
      }
    }
  }
}
`;

/** Map GitHub color to contribution level */
function colorToLevel(color: string): ContributionLevel {
  const map: Record<string, ContributionLevel> = {
    "#ebedf0": 0,
    "#9be9a8": 1,
    "#40c463": 2,
    "#30a14e": 3,
    "#216e39": 4,
    // Dark mode colors
    "#161b22": 0,
    "#0e4429": 1,
    "#006d32": 2,
    "#26a641": 3,
    "#39d353": 4,
  };
  return map[color.toLowerCase()] ?? 0;
}

interface ContributionDay {
  contributionCount: number;
  date: string;
  weekday: number;
  color: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

interface ContributionData {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: ContributionWeek[];
      };
    };
  } | null;
}

/**
 * Fetch contribution data from GitHub GraphQL API
 */
export async function fetchContributions(
  username: string,
  token?: string
): Promise<Grid> {
  try {
    const data = await githubGraphQL<ContributionData>(
      CONTRIBUTION_QUERY,
      { login: username },
      token
    );

    if (!data.user) {
      throw new Error(`User "${username}" not found on GitHub`);
    }

    const weeks = data.user.contributionsCollection.contributionCalendar.weeks;
    return weeksToGrid(weeks);
  } catch (error) {
    // Very active accounts exceed GitHub's per-query resource limit for the
    // full-year calendar; fall back to fetching the year in smaller windows.
    if (!isResourceLimited(error)) throw error;
    console.error(
      "Full-year calendar query exceeded GitHub resource limits, fetching in windows..."
    );
    const today = new Date().toISOString().slice(0, 10);
    const range = await fetchCalendarRange(
      username,
      addDays(today, -364),
      today,
      token
    );
    return daysToGrid(range.days);
  }
}

/** Quartile level relative to the year's busiest day (mirrors GitHub's scale) */
function countToLevel(count: number, max: number): ContributionLevel {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as ContributionLevel;
}

/**
 * Build a grid from windowed calendar days. Unlike the single-query path
 * there are no per-day colors here (they are window-relative), so levels are
 * computed from the raw counts instead.
 */
function daysToGrid(days: CalendarDay[]): Grid {
  const max = days.reduce((m, d) => Math.max(m, d.contributionCount), 0);

  const weeks: CalendarDay[][] = [];
  for (const day of days) {
    if (day.weekday === 0 || weeks.length === 0) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }

  const width = weeks.length;
  const height = 7;
  const cells: Cell[][] = [];

  for (let x = 0; x < width; x++) {
    cells[x] = [];
    for (let y = 0; y < height; y++) {
      cells[x][y] = { x, y, contributionLevel: 0, owner: CellOwner.None };
    }
    for (const day of weeks[x]) {
      cells[x][day.weekday].contributionLevel = countToLevel(
        day.contributionCount,
        max
      );
    }
  }

  return { cells, width, height };
}

/**
 * Convert GitHub API weeks data to our Grid format
 */
function weeksToGrid(weeks: ContributionWeek[]): Grid {
  const width = weeks.length;
  const height = 7;

  const cells: Cell[][] = [];

  for (let x = 0; x < width; x++) {
    cells[x] = [];
    const week = weeks[x];
    for (let y = 0; y < height; y++) {
      const day = week.contributionDays[y];
      cells[x][y] = {
        x,
        y,
        contributionLevel: day ? colorToLevel(day.color) : 0,
        owner: CellOwner.None,
      };
    }
  }

  return { cells, width, height };
}

/**
 * Create a mock grid for testing (no API call needed)
 */
export function createMockGrid(width: number = 52, height: number = 7): Grid {
  const cells: Cell[][] = [];

  for (let x = 0; x < width; x++) {
    cells[x] = [];
    for (let y = 0; y < height; y++) {
      cells[x][y] = {
        x,
        y,
        contributionLevel: Math.floor(Math.random() * 5) as ContributionLevel,
        owner: CellOwner.None,
      };
    }
  }

  return { cells, width, height };
}
