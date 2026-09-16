import type { Snapshot } from "@/lib/records/store";
import { label } from "@/lib/records/validation";
const captions: Record<string, string> = {
  name: "Organisation",
  mainContact: "Main contact",
  phoneNumbers: "Phone numbers",
  email: "Email",
  reference: "Account / reference",
  notes: "Notes",
  title: "Title",
  detail: "Detail",
  kind: "Type",
  status: "Status",
  organisationId: "Organisation",
  interactionId: "Source interaction",
  projectId: "Project",
  projectIds: "Projects",
  assignee: "Assigned to",
  occurredAt: "When it happened",
  dueDate: "Due date",
  followUpDate: "Follow-up date",
  deadline: "Confirmed deadline",
};
export function RecordSummary({
  record,
  data,
}: {
  record: Record<string, unknown>;
  data: Snapshot;
}) {
  function display(key: string, value: unknown) {
    if (value === null || value === undefined || value === "") return "Not set";
    if (key === "organisationId")
      return (
        data.organisations.find((o) => o.id === value)?.name ??
        data.deletedOrganisations.find((o) => o.id === value)?.name ??
        "Linked organisation"
      );
    if (key === "interactionId")
      return (
        data.interactions.find((o) => o.id === value)?.title ??
        data.deletedInteractions.find((o) => o.id === value)?.title ??
        "Linked interaction"
      );
    if (key === "projectId")
      return (
        data.projects.find((o) => o.id === value)?.name ??
        data.deletedProjects.find((o) => o.id === value)?.name ??
        "Linked project"
      );
    if (key === "projectIds" && Array.isArray(value)) {
      const names = (value as string[]).map(
        (id) =>
          data.projects.find((p) => p.id === id)?.name ??
          data.deletedProjects.find((p) => p.id === id)?.name ??
          id,
      );
      return names.join(" · ") || "Not set";
    }
    if (key === "assignee") return String(value).split("@")[0];
    if (key === "status" || key === "kind") return label(String(value));
    if (key === "occurredAt")
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      }).format(new Date(String(value)));
    if (["dueDate", "followUpDate", "deadline"].includes(key))
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(String(value)));
    if (Array.isArray(value)) return value.join(" · ") || "Not set";
    return String(value);
  }
  return (
    <dl className="revision-values">
      {Object.entries(record)
        .filter(([key]) => key in captions)
        .map(([key, value]) => (
          <div key={key}>
            <dt>{captions[key]}</dt>
            <dd>{display(key, value)}</dd>
          </div>
        ))}
    </dl>
  );
}
