import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore } from "@/lib/records/store";
import { londonToday } from "@/lib/records/validation";
import { exportCsv, exportViews, type ExportView } from "@/lib/finances/export";

/**
 * CSV export for spreadsheet use. Protected exactly like every other data
 * operation: the Cloudflare identity is verified on the server first. Formula
 * injection is handled inside the CSV writer.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await currentUser();
  } catch {
    return new Response(
      "Protected workspace – open through Cloudflare Access",
      {
        status: 401,
      },
    );
  }
  const users = user.demo
    ? ["alex@example.invalid", "jamie@example.invalid"]
    : authConfiguration(process.env).users;
  const store = recordStore(database(), users);
  const snapshot = store.snapshot();

  const requested =
    new URL(request.url).searchParams.get("view") ?? "inventory";
  const view = (exportViews as readonly string[]).includes(requested)
    ? (requested as ExportView)
    : null;
  if (!view)
    return new Response(
      `Unknown export. Use one of: ${exportViews.join(", ")}`,
      {
        status: 400,
      },
    );

  const organisationName = (id: string | null) =>
    id
      ? (snapshot.organisations.find((o) => o.id === id)?.name ??
        snapshot.deletedOrganisations.find((o) => o.id === id)?.name ??
        "")
      : "";
  const projectName = (id: string | null) =>
    id
      ? (snapshot.projects.find((p) => p.id === id)?.name ??
        snapshot.deletedProjects.find((p) => p.id === id)?.name ??
        "")
      : "";

  const { filename, csv } = exportCsv(view, {
    records: snapshot.financeRecords,
    movements: snapshot.financeMovements,
    users,
    organisationName,
    projectName,
    today: londonToday(),
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
