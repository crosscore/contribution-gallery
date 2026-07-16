/**
 * GitHub GraphQL client with retry.
 *
 * The scheduled CI run hits the API cold every 6 hours and occasionally sees
 * transient failures (504 Gateway Timeout, or a 200 whose data is null with a
 * server-side error). Those are worth retrying. NOT_FOUND and
 * RESOURCE_LIMITS_EXCEEDED are deterministic, so they fail fast — the latter
 * is handled by callers via range splitting (see calendar.ts).
 */

interface GraphQLErrorEntry {
  type?: string;
  message: string;
}

interface GraphQLEnvelope<T> {
  data?: T;
  errors?: GraphQLErrorEntry[];
}

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 2_000;

const NON_RETRYABLE_TYPES = ["NOT_FOUND", "RESOURCE_LIMITS_EXCEEDED"];

export class GitHubGraphQLError extends Error {
  constructor(
    message: string,
    readonly errorTypes: string[] = [],
    readonly retryable = false,
    /** Server-requested wait (Retry-After) before the next attempt, in ms */
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "GitHubGraphQLError";
  }
}

/** True when the query failed because the requested data volume was too big */
export function isResourceLimited(error: unknown): boolean {
  return (
    error instanceof GitHubGraphQLError &&
    error.errorTypes.includes("RESOURCE_LIMITS_EXCEEDED")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt<T>(
  query: string,
  variables: Record<string, string>,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `bearer ${token}`;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    // 5xx is transient; 403/429 are (secondary) rate limits and clear after a
    // wait; other 4xx auth/validation failures are not retryable
    const rateLimited = response.status === 403 || response.status === 429;
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new GitHubGraphQLError(
      `GitHub API request failed: ${response.status} ${response.statusText}`,
      [],
      response.status >= 500 || rateLimited,
      retryAfter > 0 ? retryAfter * 1000 : rateLimited ? 60_000 : undefined
    );
  }

  const json = (await response.json()) as GraphQLEnvelope<T>;

  if (json.errors?.length) {
    const types = json.errors.flatMap((e) => (e.type ? [e.type] : []));
    throw new GitHubGraphQLError(
      `GitHub GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
      types,
      // RATE_LIMITED, internal "Something went wrong", etc. — retryable
      !types.some((t) => NON_RETRYABLE_TYPES.includes(t))
    );
  }

  if (json.data === undefined || json.data === null) {
    throw new GitHubGraphQLError("GitHub GraphQL returned no data", [], true);
  }

  return json.data;
}

/**
 * Run a GraphQL query against the GitHub API, retrying transient failures
 * with exponential backoff (2s, 4s, 8s).
 */
export async function githubGraphQL<T>(
  query: string,
  variables: Record<string, string>,
  token?: string
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await attempt<T>(query, variables, token);
    } catch (error) {
      if (error instanceof GitHubGraphQLError && !error.retryable) throw error;
      lastError = error;
      if (i < MAX_ATTEMPTS - 1) {
        const delay = Math.max(
          BASE_DELAY_MS * 2 ** i,
          error instanceof GitHubGraphQLError ? error.retryAfterMs ?? 0 : 0
        );
        console.error(
          `GitHub API attempt ${i + 1}/${MAX_ATTEMPTS} failed (${
            error instanceof Error ? error.message : error
          }), retrying in ${delay / 1000}s...`
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
