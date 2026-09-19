/**
 * The Event log's filters, remembered in this browser between visits.
 *
 * This is the only state in the app that outlives a page load, and it is
 * deliberately the smallest thing that can be stored: five filter values and an
 * order, under one key, in `localStorage`, on this device only. There are no
 * accounts and no server-side view state, so nothing is sent anywhere and a
 * second user on a different device sees their own filters.
 *
 * Everything read back is validated against what exists now. A stored
 * organisation or project can be deleted between visits, and a filter pointing
 * at something that is no longer there would quietly hide every event, so an
 * unknown value falls back to "all" rather than being trusted.
 */
export type EventFilters = {
  query: string;
  /** "all", "none", or an organisation id. */
  organisationId: string;
  /** "all", "none", or a project id. */
  projectId: string;
  /** "all", or an interaction kind. */
  kind: string;
  /** "all", or the email of whoever recorded the event. */
  recorder: string;
  order: "newest" | "oldest";
};

export const eventFiltersKey = "estate-organiser:event-log-filters";

export const defaultEventFilters: EventFilters = {
  query: "",
  organisationId: "all",
  projectId: "all",
  kind: "all",
  recorder: "all",
  order: "newest",
};

/** What the stored values may legitimately refer to on this visit. */
export type EventFilterOptions = {
  organisationIds: string[];
  projectIds: string[];
  kinds: string[];
  recorders: string[];
};

/** A search long enough for anything a person would type into the box. */
const QUERY_LIMIT = 200;

const isText = (value: unknown): value is string => typeof value === "string";

/**
 * One of a fixed set of words, or the fallback. Never a value from storage that
 * nothing on the screen could have produced.
 */
function oneOf(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  return isText(value) && allowed.includes(value) ? value : fallback;
}

export function isDefaultEventFilters(filters: EventFilters): boolean {
  return (
    filters.query.trim() === "" &&
    filters.organisationId === "all" &&
    filters.projectId === "all" &&
    filters.kind === "all" &&
    filters.recorder === "all" &&
    filters.order === "newest"
  );
}

export function serialiseEventFilters(filters: EventFilters): string {
  return JSON.stringify(filters);
}

/**
 * Read stored filters back. Anything unexpected — no value, damaged JSON, a
 * field of the wrong type, an id that no longer exists — falls back to the
 * default for that field, so a bad entry can never hide the event log or break
 * the page.
 */
export function parseEventFilters(
  raw: string | null,
  options: EventFilterOptions,
): EventFilters {
  if (!raw) return defaultEventFilters;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultEventFilters;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return defaultEventFilters;
  const stored = parsed as Record<string, unknown>;
  return {
    query: isText(stored.query)
      ? stored.query.slice(0, QUERY_LIMIT)
      : defaultEventFilters.query,
    organisationId: oneOf(
      stored.organisationId,
      ["all", "none", ...options.organisationIds],
      "all",
    ),
    projectId: oneOf(
      stored.projectId,
      ["all", "none", ...options.projectIds],
      "all",
    ),
    kind: oneOf(stored.kind, ["all", ...options.kinds], "all"),
    recorder: oneOf(stored.recorder, ["all", ...options.recorders], "all"),
    order: oneOf(stored.order, ["newest", "oldest"], "newest") as
      "newest" | "oldest",
  };
}
