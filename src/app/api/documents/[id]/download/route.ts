import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore } from "@/lib/records/store";
import { fullPath } from "@/lib/documents/storage";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await currentUser();
  } catch {
    return new Response("Protected workspace – open through Cloudflare Access", {
      status: 401,
    });
  }
  const users = user.demo
    ? ["alex@example.invalid", "jamie@example.invalid"]
    : authConfiguration(process.env).users;
  const store = recordStore(database(), users);
  const snap = store.snapshot();
  const { id } = await params;
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "1";

  const doc =
    snap.documents.find((d) => d.id === id) ||
    snap.deletedDocuments.find((d) => d.id === id);
  if (!doc) {
    return new Response("Document not found", { status: 404 });
  }
  if (doc.deletedAt) {
    return new Response("Document is in the recoverable bin – restore it first", {
      status: 410,
    });
  }

  const path = fullPath(doc.storageName);
  if (!existsSync(path)) {
    return new Response("File missing from storage – check backup", {
      status: 410,
    });
  }

  try {
    const fileStat = await stat(path);
    const stream = createReadStream(path);

    const safeMime =
      doc.mimeType.startsWith("image/") || doc.mimeType === "application/pdf"
        ? doc.mimeType
        : "application/octet-stream";

    const dispositionType =
      forceDownload || !(safeMime.startsWith("image/") || safeMime === "application/pdf")
        ? "attachment"
        : "inline";

    const disposition = `${dispositionType}; filename="${encodeURIComponent(doc.originalName)}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`;

    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": safeMime,
        "Content-Length": fileStat.size.toString(),
        "Content-Disposition": disposition,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Unable to read file", { status: 500 });
  }
}
