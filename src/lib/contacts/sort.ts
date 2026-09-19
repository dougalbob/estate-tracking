/**
 * The one order every contact picker in the app agrees on: A>Z by name.
 *
 * The snapshot deliberately has no ORDER BY on organisations, because the
 * Contacts tab's default "Added order" is the database's insertion order, and
 * sorting in the store would quietly destroy that option. So every picker
 * sorts its own copy — `[...data.organisations].sort(byContactName)` — and
 * leaves the snapshot alone, which is also what keeps each picker's fixed
 * options where they belong ("No organisation" and "Pick contact…" first,
 * "+ New contact…" last in the task and note form).
 */

/**
 * Compares two contacts — or anything else with a `name` — A>Z, using the
 * runtime's default collation so the pickers can never disagree with the
 * Contacts tab's A>Z sort, which uses the same comparator. A plain
 * comparator for `Array.prototype.sort`: it creates no array and changes
 * nothing.
 */
export function byContactName(
  a: { name: string },
  b: { name: string },
): number {
  return a.name.localeCompare(b.name);
}
