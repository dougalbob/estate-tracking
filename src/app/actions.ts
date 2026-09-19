"use server";
import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore, RecordError } from "@/lib/records/store";
import { revalidatePath } from "next/cache";
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
import { toActionFailure } from "@/lib/records/action-errors";
import { demoUsers, withStore } from "@/lib/records/with-store";
import { documentLinkInput, financeVoidInput } from "@/lib/records/validation";

type Kind = "organisation" | "interaction" | "task" | "project" | "document";
type BinKind = Kind | "finance_record" | "finance_movement" | "template_item";

/**
 * Every action below is one line of intent wrapped in `withStore`, which owns
 * the identity check, the store, the page revalidation and the mapping of a
 * thrown error into a refusal. The second argument is the plain sentence the
 * person sees if something unexpected happens, so each action can still say what
 * it was trying to do.
 */
export async function saveRecord(kind: Kind, input: unknown) {
  return withStore(
    "Unable to save. Check your access and try again. Your draft has been kept.",
    async ({ store, actor }) => {
      switch (kind) {
        case "organisation":
          return { id: store.saveOrganisation(input, actor) };
        case "interaction":
          return { id: store.saveInteraction(input, actor) };
        case "task":
          return { id: store.saveTask(input, actor) };
        case "project":
          return { id: store.saveProject(input, actor) };
        case "document":
          return { id: store.saveDocument(input, actor) };
        default:
          // Unreachable while `kind` is one of the five above; a refusal rather
          // than a silence, so a new kind cannot be saved by the wrong branch.
          throw new RecordError("Unknown record type", "validation");
      }
    },
  );
}

/**
 * Attach a task that already exists to a contact (Item 1). Only the link is
 * sent from the browser; the server reads the task itself so a screen left open
 * cannot write an old copy of it back over a newer one.
 */
export async function linkTaskToOrganisation(input: unknown) {
  return withStore(
    "Unable to link that task. Check your access and try again. Your draft has been kept.",
    ({ store, actor }) => ({
      id: store.linkTaskToOrganisation(input, actor),
    }),
  );
}

/**
 * Moving a task to another day from the calendar. Only the due date is sent: the
 * rest of the task is left alone on the server, so a drag cannot quietly change
 * anything else about it.
 */
export async function rescheduleTask(input: unknown) {
  return withStore(
    "Unable to move that task. Check your access and try again. Nothing has been changed.",
    ({ store, actor }) => ({ id: store.setTaskDueDate(input, actor) }),
  );
}

/**
 * Create a contact and the task or note that needs it in one save (Item 2).
 * Both are written in a single database transaction, so a failure cannot leave a
 * contact behind on its own with no record explaining where it came from.
 */
export async function saveRecordWithNewOrganisation(
  kind: "task" | "interaction",
  input: unknown,
  organisation: unknown,
) {
  return withStore(
    "Nothing was saved: the new contact and the task are both still unsaved. Your draft is still here – check your access and try again.",
    ({ store, actor }) =>
      store.saveRecordWithNewOrganisation(kind, input, organisation, actor),
  );
}

export async function saveFinanceRecord(input: unknown) {
  return withStore(
    "Unable to save. Check your access and try again. Your draft has been kept.",
    ({ store, actor }) => ({ id: store.saveFinanceRecord(input, actor) }),
  );
}

export async function saveFinanceMovement(input: unknown) {
  return withStore(
    "Unable to save this money movement. Your draft has been kept.",
    ({ store, actor }) => ({ id: store.saveFinanceMovement(input, actor) }),
  );
}

/** Voiding keeps a financial record visible, with a reason, out of the totals. */
export async function setFinanceVoid(input: unknown) {
  return withStore(
    "Unable to change this record. Check your access and try again.",
    ({ store, actor }) => {
      store.setFinanceVoid(financeVoidInput.parse(input), actor);
      return {};
    },
  );
}

/** Turns selected checklist suggestions into ordinary, undated tasks. */
export async function applyTemplate(input: unknown) {
  return withStore(
    "Unable to add these suggestions. Please try again.",
    ({ store, actor }) => store.applyTemplate(input, actor),
  );
}

export async function saveTemplateItem(input: unknown) {
  return withStore(
    "Unable to save this checklist item. Your draft has been kept.",
    ({ store, actor }) => ({ id: store.saveTemplateItem(input, actor) }),
  );
}

/**
 * The fallback upload path, used when the streaming route is unavailable (an
 * older image). It answers in the same sentences as the route, because both read
 * the same `prepareUpload` rule.
 *
 * This one does not use `withStore`: identity has to be verified before anything
 * is written to disk, and the file has to be cleaned up again if the record
 * cannot be saved. Both of those are this function's job, not a wrapper's.
 */
export async function uploadDocument(formData: FormData) {
  const startedAt = Date.now();
  let user;
  try {
    user = await currentUser();
  } catch {
    // Nothing is written before identity is verified, so a request that cannot
    // prove who it is leaves no file behind.
    return {
      ok: false as const,
      error: uploadSentences.unexpected,
      code: "unavailable",
    };
  }
  const users = user.demo ? demoUsers : authConfiguration(process.env).users;
  const store = recordStore(database(), users);

  const prepared = prepareUpload(formData);
  if (!prepared.ok) {
    console.warn(
      `[upload] refused by ${user.email}: ${prepared.rejection.error}`,
    );
    return {
      ok: false as const,
      error: prepared.rejection.error,
      code: prepared.rejection.code,
    };
  }
  const { file, mime, friendlyName, category, links, hasLink } =
    prepared.upload;

  const docsPath = ensureDocumentsPath();
  console.log(
    `[upload] attempt by ${user.email}: ${file.name} (${file.size} bytes, ${mime}) -> ${docsPath} friendly="${friendlyName}"`,
  );

  const originalName = safeOriginalName(file.name);
  const storageName = safeStorageName(originalName);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    console.error(`[upload] arrayBuffer failed for ${file.name}`, error);
    return {
      ok: false as const,
      error: uploadSentences.unreadable,
      code: "unavailable",
    };
  }

  // The file is written first and the record second, so a failure to save the
  // record leaves nothing behind: the file is removed again below.
  const path = fullPath(storageName);
  try {
    await writeFile(path, buffer);
    console.log(
      `[upload] wrote ${path} ${buffer.length} bytes in ${Date.now() - startedAt}ms`,
    );
  } catch (writeErr: unknown) {
    const code = (writeErr as NodeJS.ErrnoException)?.code;
    console.error(
      `[upload] write failed ${path} code=${code} – check the README's document upload troubleshooting section`,
      writeErr,
    );
    return {
      ok: false as const,
      error:
        code === "ENOSPC" ? uploadSentences.diskFull : uploadSentences.storage,
      code: "unavailable",
    };
  }

  try {
    const id = store.createDocumentFromUpload(
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
        store.linkDocument({ documentId: id, ...links }, user.email);
      } catch (linkError) {
        if (linkError instanceof RecordError) {
          // The document is safe and worth keeping; only the link failed, and
          // it can be made again from the record.
          revalidatePath("/");
          console.warn(
            `[upload] document ${id} saved but link failed: ${linkError.message}`,
          );
          return { ok: true as const, id, warning: linkError.message };
        }
        throw linkError;
      }
    }
    console.log(
      `[upload] success ${id} ${originalName} -> ${storageName} in ${Date.now() - startedAt}ms`,
    );
    revalidatePath("/");
    return { ok: true as const, id };
  } catch (error) {
    try {
      if (existsSync(path)) await unlink(path);
    } catch {}
    console.warn(`[upload] record not saved for ${originalName}`, error);
    return toActionFailure(error, uploadSentences.unexpected);
  }
}

export async function linkDocument(input: unknown) {
  return withStore("Unable to link document", ({ store, actor }) => ({
    id: store.linkDocument(documentLinkInput.parse(input), actor),
  }));
}

export async function unlinkDocument(linkId: string) {
  return withStore("Unable to remove link", ({ store, actor }) => {
    store.unlinkDocument(linkId, actor);
    return {};
  });
}

export async function deleteRecord(
  kind: BinKind,
  id: string,
  version: number,
  permanent = false,
) {
  return withStore(
    "Unable to delete. Check your access and try again.",
    async ({ store, actor }) => {
      if (kind === "template_item") {
        store.deleteTemplateItem(id, version, actor, permanent);
        return {};
      }
      if (kind === "finance_record" || kind === "finance_movement") {
        store.deleteFinance(
          kind === "finance_record" ? "record" : "movement",
          id,
          version,
          actor,
          permanent,
        );
        return {};
      }
      const result = store.deleteRecord(kind, id, version, actor, permanent);
      // Permanently deleting a document removes its file too. A file that will
      // not delete is not a reason to report the record as still there – it is
      // gone from the database, and the orphan can be cleared by hand.
      if (kind === "document" && permanent) {
        const storageName = (result as { storageName?: string })?.storageName;
        if (storageName) {
          try {
            const path = fullPath(storageName);
            if (existsSync(path)) await unlink(path);
          } catch (error) {
            console.warn(
              `[delete] document ${id} deleted but its file could not be removed`,
              error,
            );
          }
        }
      }
      return {};
    },
  );
}

export async function restoreRecord(
  kind: BinKind,
  id: string,
  version: number,
) {
  return withStore(
    "Unable to restore. Check your access and try again.",
    async ({ store, actor }) => {
      if (kind === "template_item") {
        store.restoreTemplateItem(id, version, actor);
        return {};
      }
      if (kind === "finance_record" || kind === "finance_movement") {
        store.restoreFinance(
          kind === "finance_record" ? "record" : "movement",
          id,
          version,
          actor,
        );
        return {};
      }
      // A document whose file is gone cannot be restored into a row that points
      // at nothing, so the file is checked first.
      if (kind === "document") {
        const snap = store.snapshot();
        const doc =
          snap.deletedDocuments.find((d) => d.id === id) ||
          snap.documents.find((d) => d.id === id);
        if (doc && !existsSync(fullPath(doc.storageName)))
          throw new RecordError(
            "The file is missing from storage – it cannot be restored. Check your backup.",
            "validation",
          );
      }
      store.restoreRecord(kind, id, version, actor);
      return {};
    },
  );
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
