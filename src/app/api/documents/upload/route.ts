import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore, RecordError } from "@/lib/records/store";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  ensureDocumentsPath,
  safeStorageName,
  safeOriginalName,
  fullPath,
} from "@/lib/documents/storage";
import {
  prepareUpload,
  uploadSentences,
} from "@/lib/documents/upload-validation";
import { demoUsers } from "@/lib/records/with-store";

/**
 * Upload via Route Handler – more robust than Server Actions for large files.
 * Server Actions default to 1 MB and need explicit bodySizeLimit; Route Handlers
 * stream the multipart body and avoid that limit.
 *
 * The rule about what may be uploaded is `prepareUpload`, which the server action
 * reads too, so the two paths cannot disagree about types, sizes or names. What
 * differs is only the shape of the answer: JSON with a status here, a result
 * object there. The sentences are the same, and the technical detail for the
 * container log stays in the log.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  let storagePath: string | null = null;
  try {
    let user;
    try {
      user = await currentUser();
    } catch {
      return Response.json(
        { error: "Protected workspace – open through Cloudflare Access" },
        { status: 401 },
      );
    }
    const users = user.demo ? demoUsers : authConfiguration(process.env).users;
    const store = recordStore(database(), users);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error("[upload:api] formData parse failed", error);
      return Response.json(
        { error: uploadSentences.incomplete },
        { status: 413 },
      );
    }

    const prepared = prepareUpload(formData);
    if (!prepared.ok) {
      console.warn(
        `[upload:api] refused by ${user.email}: ${prepared.rejection.error}`,
      );
      return Response.json(
        { error: prepared.rejection.error },
        { status: prepared.rejection.status },
      );
    }
    const { file, mime, friendlyName, category, links, hasLink } =
      prepared.upload;

    const docsPath = ensureDocumentsPath();
    console.log(
      `[upload:api] attempt by ${user.email}: ${file.name} (${file.size} bytes, ${mime}) -> ${docsPath} friendly="${friendlyName}"`,
    );

    const originalName = safeOriginalName(file.name);
    const storageName = safeStorageName(originalName);
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      console.error(`[upload:api] arrayBuffer failed for ${file.name}`, error);
      return Response.json(
        { error: uploadSentences.unreadable },
        { status: 500 },
      );
    }

    // The file is written first and the record second; if the record fails the
    // file is removed again, so a failed upload leaves nothing behind.
    const path = fullPath(storageName);
    storagePath = path;
    try {
      await writeFile(path, buffer);
      console.log(
        `[upload:api] wrote ${path} ${buffer.length} bytes in ${Date.now() - startedAt}ms`,
      );
    } catch (writeErr: unknown) {
      const code = (writeErr as NodeJS.ErrnoException)?.code;
      console.error(
        `[upload:api] write failed ${path} code=${code} – check the README's document upload troubleshooting section`,
        writeErr,
      );
      return Response.json(
        {
          error:
            code === "ENOSPC"
              ? uploadSentences.diskFull
              : uploadSentences.storage,
        },
        { status: code === "ENOSPC" ? 507 : 500 },
      );
    }

    try {
      const docId = store.createDocumentFromUpload(
        {
          friendlyName,
          originalName,
          storageName,
          mimeType: mime,
          size: file.size,
          category,
        },
        user.email,
      );

      if (hasLink) {
        try {
          store.linkDocument({ documentId: docId, ...links }, user.email);
        } catch (linkError) {
          if (linkError instanceof RecordError) {
            // The document is safe; only the link failed, and it can be made
            // again from the record.
            console.warn(
              `[upload:api] document ${docId} saved but link failed: ${linkError.message}`,
            );
            return Response.json({
              ok: true,
              id: docId,
              warning: linkError.message,
            });
          }
          throw linkError;
        }
      }
      console.log(
        `[upload:api] success ${docId} ${originalName} -> ${storageName} in ${Date.now() - startedAt}ms`,
      );
      return Response.json({ ok: true, id: docId });
    } catch (dbError) {
      try {
        if (storagePath && existsSync(storagePath)) await unlink(storagePath);
      } catch {}
      storagePath = null;
      if (dbError instanceof RecordError) {
        console.warn(
          `[upload:api] db error for ${originalName}: ${dbError.message}`,
        );
        return Response.json({ error: dbError.message }, { status: 400 });
      }
      console.error(
        `[upload:api] unexpected db error for ${originalName}`,
        dbError,
      );
      return Response.json(
        { error: uploadSentences.unexpected },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[upload:api] unexpected failure", error);
    if (storagePath) {
      try {
        if (existsSync(storagePath)) await unlink(storagePath);
      } catch {}
    }
    return Response.json(
      { error: uploadSentences.unexpected },
      { status: 500 },
    );
  }
}

// Increase body size limit for this route if Next respects it (Route Handlers don't use serverActions limit, but keep explicit)
export const dynamic = "force-dynamic";
