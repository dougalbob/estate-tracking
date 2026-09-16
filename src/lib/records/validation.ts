import { z } from "zod";
export const organisationStatuses = [
  "not_contacted",
  "in_progress",
  "awaiting_response",
  "resolved",
] as const;
export const taskStatuses = [
  "to_do",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
] as const;
const optionalText = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((v) => v || null);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date",
  )
  .nullable();
const common = {
  id: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
};
export const organisationInput = z.object({
  ...common,
  name: z.string().trim().min(1, "An organisation name is required").max(200),
  mainContact: optionalText,
  phoneNumbers: z.array(z.string().trim().min(1).max(80)).max(10),
  email: z
    .union([z.email(), z.literal(""), z.null()])
    .transform((v) => v || null),
  reference: optionalText,
  notes: z.string().max(20000).nullable(),
  status: z.enum(organisationStatuses),
  confirmResolve: z.boolean().optional(),
});
export const taskInput = z.object({
  ...common,
  title: z.string().trim().min(1, "A task title is required").max(300),
  detail: z.string().max(20000),
  organisationId: optionalText,
  interactionId: optionalText,
  projectId: optionalText,
  assignee: optionalText,
  status: z.enum(taskStatuses),
  dueDate: date,
  followUpDate: date,
  deadline: date,
});
export const interactionInput = z
  .object({
    ...common,
    organisationId: optionalText,
    title: z.string().trim().max(300),
    detail: z.string().trim().min(1, "Add some detail to your note").max(20000),
    kind: z.enum(["call", "email", "letter", "web_form", "note"]),
    occurredAt: z.iso.datetime(),
    followUps: z
      .array(taskInput.omit({ id: true, version: true }))
      .max(30)
      .default([]),
  })
  .refine(
    (v) => v.kind === "note" || v.title.length > 0,
    "An interaction title is required",
  );
export type OrganisationInput = z.input<typeof organisationInput>;
export type TaskInput = z.input<typeof taskInput>;
export type InteractionInput = z.input<typeof interactionInput>;
export const label = (value: string) =>
  value
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
export function attentionDate(t: {
  dueDate: string | null;
  followUpDate: string | null;
  deadline: string | null;
}) {
  return (
    [t.dueDate, t.followUpDate, t.deadline]
      .filter((v): v is string => !!v)
      .sort()[0] ?? null
  );
}
export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
