/**
 * What the contact line under a document's friendly name is made of.
 *
 * A document row lists the records it is directly linked to, and a document
 * can be linked to several contacts at once, mixed with notes, tasks and
 * projects. Before v0.2.7 that line was rendered as one joined string of
 * names. Now every directly linked *live* contact is its own tappable item
 * (it opens the same contact popup a task row does), and everything else
 * stays plain text: a note or a task by title, a project by name, and a
 * contact in the recoverable bin by name, because there is no live record
 * behind it to show.
 *
 * That is the one new decision the row has to make — which name is a contact
 * and whether it is live — so it lives here as a pure function with unit
 * tests, exactly like the popup's `tel:` and clipboard helpers, rather than
 * as a chain of lookups inside the component. The items come back in link
 * order, and a name that is not a live contact reads exactly as it did
 * before, so the line looks unchanged when nothing is tappable.
 *
 * One pre-existing quirk is carried over deliberately, not fixed: a link
 * whose only target is a financial record produces no item at all, so a
 * receipt attached to a payment still reads "No links yet" on the Documents
 * row even though it is linked.
 */

export type DocumentLinkItem =
  | { kind: "contact"; organisationId: string; name: string }
  | { kind: "text"; value: string };

type Named = { id: string; name: string };
type Titled = { id: string; title: string };
type LinkRow = {
  documentId: string;
  organisationId: string | null;
  interactionId: string | null;
  taskId: string | null;
  projectId: string | null;
  financeRecordId: string | null;
};

export function documentLinkItems(
  documentId: string,
  links: readonly LinkRow[],
  organisations: readonly Named[],
  deletedOrganisations: readonly Named[],
  tasks: readonly Titled[],
  interactions: readonly Titled[],
  /** Live and binned projects combined: a project name is text either way. */
  projects: readonly Named[],
): DocumentLinkItem[] {
  const items: DocumentLinkItem[] = [];
  for (const link of links) {
    if (link.documentId !== documentId) continue;
    if (link.organisationId) {
      const live = organisations.find((o) => o.id === link.organisationId);
      if (live)
        items.push({
          kind: "contact",
          organisationId: live.id,
          name: live.name,
        });
      else
        items.push({
          kind: "text",
          value:
            deletedOrganisations.find((o) => o.id === link.organisationId)
              ?.name ?? "Linked organisation",
        });
    } else if (link.interactionId) {
      items.push({
        kind: "text",
        value:
          interactions.find((i) => i.id === link.interactionId)?.title ??
          "Note",
      });
    } else if (link.taskId) {
      items.push({
        kind: "text",
        value: tasks.find((t) => t.id === link.taskId)?.title ?? "Task",
      });
    } else if (link.projectId) {
      items.push({
        kind: "text",
        value:
          projects.find((p) => p.id === link.projectId)?.name ??
          "Linked project",
      });
    }
    // A link to a financial record only produces no item (see above).
  }
  return items;
}
