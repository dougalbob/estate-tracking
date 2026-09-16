import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore } from "@/lib/records/store";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fullPath } from "@/lib/documents/storage";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";

export async function GET(
  _request: Request,
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

  // Check both active and deleted? Only allow download of active documents, not those in bin, to avoid confusion
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

    // Prevent unsafe inline execution – serve as attachment with safe mime
    const safeMime = doc.mimeType.startsWith("image/") || doc.mimeType === "application/pdf"
      ? doc.mimeType
      : "application/octet-stream";

    // For images and PDFs, allow inline viewing but with nosniff and safe disposition
    const disposition = safeMime.startsWith("image/") || safeMime === "application/pdf"
      ? `inline; filename="${encodeURIComponent(doc.originalName)}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`
      : `attachment; filename="${encodeURIComponent(doc.originalName)}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`;

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
