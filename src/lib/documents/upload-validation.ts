/**
 * The one upload rule, used by both ways a file can arrive: the streaming route
 * (`POST /api/documents/upload`, which the dialogs prefer) and the server action
 * they fall back to.
 *
 * The whole sequence existed twice, and that is how the two came to disagree
 * about which extensions were allowed — a HEIC shared from an app that omits the
 * MIME type was accepted by the share sheet and then refused at upload. v0.2.14
 * shared the file-type rule; this shares the sequence around it as well, so the
 * next change is made once and lands in both paths.
 *
 * The sentences here are the ones a person reads. The technical detail — status
 * codes, error codes, disk paths — belongs in the container log and the README's
 * upload troubleshooting section, not in a dialog.
 */
import {
  documentInput,
  isAllowedUploadFile,
  maxDocumentSizeBytes,
} from "../records/validation";
import { formatSize } from "./size";

export type UploadLinks = {
  organisationId: string | null;
  interactionId: string | null;
  taskId: string | null;
  projectId: string | null;
  financeRecordId: string | null;
};

export type PreparedUpload = {
  file: File;
  /** What the browser told us, or the generic type when it told us nothing. */
  mime: string;
  friendlyName: string;
  category: string | null;
  /** The date printed on the document, if one was typed in. Blank means "added". */
  documentDate: string | null;
  links: UploadLinks;
  /** Whether the upload should be linked to something as it is stored. */
  hasLink: boolean;
};

export type UploadRejection = {
  error: string;
  code: "validation";
  /** What the route answers with; the server action returns the sentence only. */
  status: number;
};

/** The limit, in the words the dialog and the server both use. */
export const uploadSizeLimit = () => formatSize(maxDocumentSizeBytes);

export const uploadSentences = {
  noFile: "Choose a file to upload.",
  tooLarge: `That file is too large to upload. The limit is ${uploadSizeLimit()}.`,
  unsupportedType:
    "That file type is not supported – please use a PDF, image, or text file.",
  unreadable: "That file could not be read. Please try again.",
  /** The request body never arrived whole: too big for the edge, or a dropped connection. */
  incomplete:
    "That upload did not reach the server whole – it may be too large, or the connection dropped. Please try again.",
  /** The server's disk is full: a real fault, but not one to shout about. */
  diskFull:
    "The server has run out of space, so the file could not be saved. The README's document upload troubleshooting section explains what to check.",
  storage:
    "The file could not be saved on the server. Please try again, or check the README's document upload troubleshooting section.",
  unexpected: "The upload did not complete. Please try again.",
} as const;

function textOrNull(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  return value || null;
}

/** The optional links a dialog can ask for as the file is stored. */
export function readUploadLinks(formData: FormData): UploadLinks {
  return {
    organisationId: textOrNull(formData, "organisationId"),
    interactionId: textOrNull(formData, "interactionId"),
    taskId: textOrNull(formData, "taskId"),
    projectId: textOrNull(formData, "projectId"),
    financeRecordId: textOrNull(formData, "financeRecordId"),
  };
}

/**
 * Check one upload and get it ready for storage. Nothing is written here: the
 * caller writes the file, then the record, and cleans the file up if the record
 * fails. Both callers do exactly that, in the same order.
 */
export function prepareUpload(
  formData: FormData,
):
  | { ok: true; upload: PreparedUpload }
  | { ok: false; rejection: UploadRejection } {
  const file = formData.get("file");
  const links = readUploadLinks(formData);
  if (!(file instanceof File) || file.size === 0)
    return {
      ok: false,
      rejection: {
        error: uploadSentences.noFile,
        code: "validation",
        status: 400,
      },
    };
  if (file.size > maxDocumentSizeBytes)
    return {
      ok: false,
      rejection: {
        error: uploadSentences.tooLarge,
        code: "validation",
        status: 413,
      },
    };
  // One shared predicate decides the type, so a file the share sheet accepted is
  // a file the upload accepts, and an SVG is refused however it arrives.
  if (!isAllowedUploadFile(file))
    return {
      ok: false,
      rejection: {
        error: uploadSentences.unsupportedType,
        code: "validation",
        status: 400,
      },
    };
  const parsed = documentInput.safeParse({
    friendlyName:
      textOrNull(formData, "friendlyName") ||
      file.name.replace(/\.[^/.]+$/, ""),
    category: textOrNull(formData, "category"),
    documentDate: textOrNull(formData, "documentDate"),
  });
  if (!parsed.success)
    return {
      ok: false,
      rejection: {
        // One sentence per distinct problem: a schema with two rules for the
        // same field reports them twice, and "Enter a valid date; Enter a valid
        // date" helps nobody.
        error: [
          ...new Set(parsed.error.issues.map((issue) => issue.message)),
        ].join("; "),
        code: "validation",
        status: 400,
      },
    };
  return {
    ok: true,
    upload: {
      file,
      mime: file.type || "application/octet-stream",
      friendlyName: parsed.data.friendlyName!,
      category: parsed.data.category ?? null,
      documentDate: parsed.data.documentDate ?? null,
      links,
      hasLink: Object.values(links).some((value) => value !== null),
    },
  };
}
