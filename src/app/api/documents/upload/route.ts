import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore, RecordError } from "@/lib/records/store";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  documentsPath,
  ensureDocumentsPath,
  safeStorageName,
  safeOriginalName,
  fullPath,
} from "@/lib/documents/storage";
import {
  allowedMimeTypes,
  maxDocumentSizeBytes,
  documentInput,
} from "@/lib/records/validation";

/**
 * Upload via Route Handler – more robust than Server Actions for large files.
 * Server Actions default to 1 MB and need explicit bodySizeLimit; Route Handlers
 * stream the multipart body and avoid that limit. This endpoint mirrors
 * uploadDocument action but returns JSON and logs detailed diagnostics for
 * production troubleshooting (docker logs, df -h, 413 vs 502/504).
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
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      console.error("[upload:api] formData parse failed", e);
      return Response.json(
        {
          error:
            "Unable to parse upload – body too large or connection interrupted. Check bodySizeLimit (should be 25mb) and try a smaller file. If behind Cloudflare Tunnel, check for 413/502/504 in browser DevTools Network tab.",
        },
        { status: 413 },
      );
    }

    const file = formData.get("file") as File | null;
    const friendlyNameRaw = formData.get("friendlyName") as string | null;
    const categoryRaw = formData.get("category") as string | null;
    const organisationId = (formData.get("organisationId") as string) || null;
    const interactionId = (formData.get("interactionId") as string) || null;
    const taskId = (formData.get("taskId") as string) || null;
    const projectId = (formData.get("projectId") as string) || null;
    const financeRecordId = (formData.get("financeRecordId") as string) || null;

    if (!file || typeof file === "string" || file.size === 0) {
      return Response.json(
        { error: "Choose a file to upload" },
        { status: 400 },
      );
    }
    if (file.size > maxDocumentSizeBytes) {
      console.warn(
        `[upload:api] rejected too large: ${file.name} ${file.size} > ${maxDocumentSizeBytes} by ${user.email}`,
      );
      return Response.json(
        {
          error: `File too large – max ${maxDocumentSizeBytes / (1024 * 1024)} MB`,
        },
        { status: 413 },
      );
    }

    const mime = file.type || "application/octet-stream";
    if (
      !(allowedMimeTypes as readonly string[]).includes(mime) &&
      !mime.startsWith("image/")
    ) {
      const lower = file.name.toLowerCase();
      if (!(
        lower.endsWith(".pdf") ||
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".webp") ||
        lower.endsWith(".tiff") ||
        lower.endsWith(".txt")
      )) {
        return Response.json(
          { error: "Unsupported file type – use PDF, image, or text" },
          { status: 400 },
        );
      }
    }

    const parsedMeta = documentInput.safeParse({
      friendlyName: friendlyNameRaw || file.name.replace(/\.[^/.]+$/, ""),
      category: categoryRaw || null,
    });
    if (!parsedMeta.success) {
      return Response.json(
        { error: parsedMeta.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const docsPath = ensureDocumentsPath();
    console.log(
      `[upload:api] attempt by ${user.email}: ${file.name} (${file.size} bytes, ${mime}) -> ${docsPath} friendly="${parsedMeta.data.friendlyName}"`,
    );

    const originalName = safeOriginalName(file.name);
    const storageName = safeStorageName(originalName);
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e) {
      console.error(`[upload:api] arrayBuffer failed for ${file.name}`, e);
      return Response.json(
        { error: "Unable to read file – try again with a smaller file" },
        { status: 500 },
      );
    }

    const path = fullPath(storageName);
    storagePath = path;
    try {
      await writeFile(path, buffer);
      console.log(
        `[upload:api] wrote ${path} ${buffer.length} bytes in ${Date.now() - startedAt}ms`,
      );
    } catch (writeErr: unknown) {
      const msg =
        writeErr instanceof Error ? writeErr.message : String(writeErr);
      const code = (writeErr as NodeJS.ErrnoException)?.code;
      console.error(
        `[upload:api] write failed ${path} code=${code} msg=${msg} – check df -h ${docsPath}`,
        writeErr,
      );
      if (code === "ENOSPC") {
        return Response.json(
          {
            error: `Disk full – unable to store file. Free space on ${docsPath} (df -h) and try again.`,
          },
          { status: 507 },
        );
      }
      return Response.json(
        {
          error: `Unable to store file – check server storage (${code || msg}). Try: df -h ${docsPath} and docker logs estate-organiser`,
        },
        { status: 500 },
      );
    }

    try {
      const docId = store.createDocumentFromUpload(
        {
          friendlyName: parsedMeta.data.friendlyName!,
          originalName,
          storageName,
          mimeType: mime,
          size: file.size,
          category: parsedMeta.data.category ?? null,
        },
        user.email,
      );

      if (
        organisationId ||
        interactionId ||
        taskId ||
        projectId ||
        financeRecordId
      ) {
        try {
          store.linkDocument(
            {
              documentId: docId,
              organisationId,
              interactionId,
              taskId,
              projectId,
              financeRecordId,
            },
            user.email,
          );
        } catch (linkError) {
          if (linkError instanceof RecordError) {
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
        { error: "Unable to save document record" },
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
      {
        error:
          "Unable to upload – check your access and try again. If this persists, check docker logs estate-organiser and df -h /mnt/user/appdata/estate-organiser",
      },
      { status: 500 },
    );
  }
}

// Increase body size limit for this route if Next respects it (Route Handlers don't use serverActions limit, but keep explicit)
export const dynamic = "force-dynamic";
