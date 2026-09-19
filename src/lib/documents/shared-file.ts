import { isAllowedUploadFile } from "../records/validation";
import { fileTooLarge } from "./size";

/**
 * Whether this one file is of a type the app stores. The rule itself lives in
 * `src/lib/records/validation.ts` beside the MIME and extension lists, so the
 * share helper, both upload paths and the file picker's `accept` all answer
 * this question the same way. A missing MIME with a good extension still
 * passes, because some Android apps do not set the MIME reliably — the
 * manifest therefore lists both, and so does the rule.
 */
export function isAllowedSharedFile(file: {
  name: string;
  type: string;
}): boolean {
  return isAllowedUploadFile(file);
}

/**
 * Pick the first file the app can store from a share.
 * - Keeps the order the phone sent: first acceptable wins (do not merge).
 * - Skips files the app cannot store (e.g. a Word doc or video).
 * - Skips files over the 20 MB limit (reuse the existing guard, do not
 *   duplicate the number).
 * Returns null when nothing in the share is acceptable.
 * Generic so callers that pass File[] get File back, and tests with plain
 * objects get that same shape.
 */
export function preferredSharedFile<
  T extends { name: string; type: string; size: number },
>(files: T[]): T | null {
  for (const f of files) {
    if (!f) continue;
    if (!isAllowedSharedFile(f as { name: string; type: string })) continue;
    // Reuse the existing size guard so the limit lives in one place.
    if (fileTooLarge(f)) continue;
    return f;
  }
  return null;
}
