"use server";
import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore, RecordError } from "@/lib/records/store";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
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
  documentLinkInput,
  financeVoidInput,
} from "@/lib/records/validation";
import { MoneyError } from "@/lib/finances/money";

type Kind = "organisation" | "interaction" | "task" | "project" | "document";
type BinKind = Kind | "finance_record" | "finance_movement";

export async function saveRecord(kind: Kind, input: unknown) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    let id: string;
    switch (kind) {
      case "organisation":
        id = store.saveOrganisation(input, user.email);
        break;
      case "interaction":
        id = store.saveInteraction(input, user.email);
        break;
      case "task":
        id = store.saveTask(input, user.email);
        break;
      case "project":
        id = store.saveProject(input, user.email);
        break;
      case "document":
        id = store.saveDocument(input, user.email);
        break;
      default:
        return {
          ok: false as const,
          error: "Unknown record type",
          code: "validation",
        };
    }
    revalidatePath("/");
    return { ok: true as const, id };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return {
        ok: false as const,
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "validation",
      };
    return {
      ok: false as const,
      error:
        "Unable to save. Check your access and try again. Your draft has been kept.",
      code: "unavailable",
    };
  }
}

export async function saveFinanceRecord(input: unknown) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    const id = store.saveFinanceRecord(input, user.email);
    revalidatePath("/");
    return { ok: true as const, id };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return {
        ok: false as const,
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "validation",
      };
    if (error instanceof MoneyError)
      return { ok: false as const, error: error.message, code: "validation" };
    return {
      ok: false as const,
      error:
        "Unable to save. Check your access and try again. Your draft has been kept.",
      code: "unavailable",
    };
  }
}

export async function saveFinanceMovement(input: unknown) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    const id = store.saveFinanceMovement(input, user.email);
    revalidatePath("/");
    return { ok: true as const, id };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return {
        ok: false as const,
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "validation",
      };
    return {
      ok: false as const,
      error: "Unable to save this money movement. Your draft has been kept.",
      code: "unavailable",
    };
  }
}

/** Voiding keeps a financial record visible, with a reason, out of the totals. */
export async function setFinanceVoid(input: unknown) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    const parsed = financeVoidInput.parse(input);
    store.setFinanceVoid(parsed, user.email);
    revalidatePath("/");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return {
        ok: false as const,
        error: error.issues.map((i) => i.message).join("; "),
        code: "validation",
      };
    return {
      ok: false as const,
      error: "Unable to change this record. Check your access and try again.",
      code: "unavailable",
    };
  }
}

export async function uploadDocument(formData: FormData) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);

    const file = formData.get("file") as File | null;
    const friendlyNameRaw = formData.get("friendlyName") as string | null;
    const categoryRaw = formData.get("category") as string | null;
    const organisationId = (formData.get("organisationId") as string) || null;
    const interactionId = (formData.get("interactionId") as string) || null;
    const taskId = (formData.get("taskId") as string) || null;
    const projectId = (formData.get("projectId") as string) || null;
    const financeRecordId = (formData.get("financeRecordId") as string) || null;

    if (!file || typeof file === "string" || file.size === 0) {
      return {
        ok: false as const,
        error: "Choose a file to upload",
        code: "validation",
      };
    }
    if (file.size > maxDocumentSizeBytes) {
      return {
        ok: false as const,
        error: `File too large – max ${maxDocumentSizeBytes / (1024 * 1024)} MB`,
        code: "validation",
      };
    }
    // Validate mime – allowlist, but also fallback to extension check for images that may be reported as octet-stream
    const mime = file.type || "application/octet-stream";
    if (
      !(allowedMimeTypes as readonly string[]).includes(mime) &&
      !mime.startsWith("image/")
    ) {
      // Still allow if extension is pdf or image
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
        return {
          ok: false as const,
          error: "Unsupported file type – use PDF, image, or text",
          code: "validation",
        };
      }
    }

    const parsedMeta = documentInput.safeParse({
      friendlyName: friendlyNameRaw || file.name.replace(/\.[^/.]+$/, ""),
      category: categoryRaw || null,
    });
    if (!parsedMeta.success) {
      return {
        ok: false as const,
        error: parsedMeta.error.issues.map((i) => i.message).join("; "),
        code: "validation",
      };
    }

    ensureDocumentsPath();
    const originalName = safeOriginalName(file.name);
    const storageName = safeStorageName(originalName);
    const buffer = Buffer.from(await file.arrayBuffer());

    // Write file first, then DB – if DB fails, clean up file
    const path = fullPath(storageName);
    try {
      await writeFile(path, buffer);
    } catch {
      return {
        ok: false as const,
        error: "Unable to store file – check server storage",
        code: "unavailable",
      };
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
      // Optional initial link
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
          // If link fails, keep document but return link error as warning? For now, return error and keep doc
          // The document itself is still usable from documents list
          if (linkError instanceof RecordError) {
            // Do not delete file – document exists, just link invalid
            revalidatePath("/");
            return {
              ok: true as const,
              id: docId,
              warning: linkError.message,
            };
          }
          throw linkError;
        }
      }
      revalidatePath("/");
      return { ok: true as const, id: docId };
    } catch (dbError) {
      // Clean up orphan file
      try {
        if (existsSync(path)) await unlink(path);
      } catch {}
      if (dbError instanceof RecordError) {
        return {
          ok: false as const,
          error: dbError.message,
          code: dbError.code,
        };
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    return {
      ok: false as const,
      error: "Unable to upload – check your access and try again",
      code: "unavailable",
    };
  }
}

export async function linkDocument(input: unknown) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    const parsed = documentLinkInput.parse(input);
    const id = store.linkDocument(parsed, user.email);
    revalidatePath("/");
    return { ok: true as const, id };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return {
        ok: false as const,
        error: error.issues.map((i) => i.message).join("; "),
        code: "validation",
      };
    return {
      ok: false as const,
      error: "Unable to link document",
      code: "unavailable",
    };
  }
}

export async function unlinkDocument(linkId: string) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    store.unlinkDocument(linkId, user.email);
    revalidatePath("/");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    return {
      ok: false as const,
      error: "Unable to remove link",
      code: "unavailable",
    };
  }
}

export async function deleteRecord(
  kind: BinKind,
  id: string,
  version: number,
  permanent = false,
) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    if (kind === "finance_record" || kind === "finance_movement") {
      store.deleteFinance(
        kind === "finance_record" ? "record" : "movement",
        id,
        version,
        user.email,
        permanent,
      );
      revalidatePath("/");
      return { ok: true as const };
    }
    const result = store.deleteRecord(kind, id, version, user.email, permanent);
    // For permanent document deletion, also remove file from disk
    if (kind === "document" && permanent) {
      const storageName = (result as { storageName?: string })?.storageName;
      if (storageName) {
        try {
          const path = fullPath(storageName);
          if (existsSync(path)) await unlink(path);
        } catch {
          // File deletion failure should not mark DB as not deleted – it already is
          // But we return warning in log? For now, ignore – admin can clean orphan files
        }
      }
    }
    revalidatePath("/");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    return {
      ok: false as const,
      error: "Unable to delete. Check your access and try again.",
      code: "unavailable",
    };
  }
}

export async function restoreRecord(
  kind: BinKind,
  id: string,
  version: number,
) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    if (kind === "finance_record" || kind === "finance_movement") {
      store.restoreFinance(
        kind === "finance_record" ? "record" : "movement",
        id,
        version,
        user.email,
      );
      revalidatePath("/");
      return { ok: true as const };
    }
    // For documents, ensure file still exists before restore
    if (kind === "document") {
      const snap = store.snapshot();
      const doc =
        snap.deletedDocuments.find((d) => d.id === id) ||
        snap.documents.find((d) => d.id === id);
      if (doc && !existsSync(fullPath(doc.storageName))) {
        return {
          ok: false as const,
          error:
            "The file is missing from storage – it cannot be restored. Check your backup.",
          code: "validation",
        };
      }
    }
    store.restoreRecord(kind, id, version, user.email);
    revalidatePath("/");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    return {
      ok: false as const,
      error: "Unable to restore. Check your access and try again.",
      code: "unavailable",
    };
  }
}

export async function switchDemoUser(choice: string) {
  const user = await currentUser();
  if (
    !user.demo ||
    process.env.NODE_ENV !== "development" ||
    !["alex", "jamie"].includes(choice)
  )
    throw new Error("Demo switching unavailable");
  const { cookies } = await import("next/headers");
  (await cookies()).set("estate-demo-user", choice, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/");
}
