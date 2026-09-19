import type { Snapshot } from "@/lib/records/store";
import { everyoneAssignee, label } from "@/lib/records/validation";
import { formatPence } from "@/lib/finances/money";
const captions: Record<string, string> = {
  name: "Organisation",
  mainContact: "Main contact",
  phoneNumbers: "Phone numbers",
  email: "Email",
  reference: "Account / reference",
  mapUrl: "Map link",
  notes: "Notes",
  title: "Title",
  detail: "Detail",
  /**
   * What happened, once it has happened. Kept apart from Detail, which on a
   * task is what was asked for when the task was set.
   */
  outcome: "Outcome",
  kind: "Type",
  status: "Status",
  organisationId: "Organisation",
  interactionId: "Source interaction",
  /** v0.2.18: the task an interaction was created from, by its title handle. */
  sourceTaskId: "Created from task",
  projectId: "Project",
  projectIds: "Projects",
  assignee: "Assigned to",
  occurredAt: "When it happened",
  dueDate: "Due date",
  followUpDate: "Follow-up date",
  deadline: "Confirmed deadline",
  friendlyName: "Friendly name",
  originalName: "Original file",
  storageName: "Stored as",
  mimeType: "Type",
  size: "Size",
  category: "Category",
  documentId: "Document",
  amountPence: "Amount",
  occurredOn: "Date",
  fundedBy: "Paid personally by",
  beneficiary: "Beneficiary",
  voidedAt: "Voided",
  voidReason: "Void reason",
  financeRecordId: "Financial record",
  recordId: "Financial record",
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
    if (key === "sourceTaskId")
      return (
        data.tasks.find((t) => t.id === value)?.title ??
        data.deletedTasks.find((t) => t.id === value)?.title ??
        "Linked task"
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
    if (key === "amountPence") return formatPence(Number(value));
    if (key === "financeRecordId" || key === "recordId")
      return (
        data.financeRecords.find((r) => r.id === value)?.title ??
        data.deletedFinanceRecords.find((r) => r.id === value)?.title ??
        "Linked financial record"
      );
    if (key === "fundedBy" || key === "beneficiary" || key === "createdBy")
      return String(value).split("@")[0];
    if (key === "voidedAt")
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      }).format(new Date(String(value)));
    if (key === "occurredOn")
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(`${String(value)}T00:00:00Z`));
    if (key === "documentId")
      return (
        data.documents.find((d) => d.id === value)?.friendlyName ??
        data.deletedDocuments.find((d) => d.id === value)?.friendlyName ??
        "Linked document"
      );
    if (key === "assignee")
      return String(value) === everyoneAssignee
        ? "Everyone"
        : String(value).split("@")[0];
    if (key === "status" || key === "kind" || key === "category")
      return label(String(value));
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
    if (key === "size" && typeof value === "number") {
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }
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
