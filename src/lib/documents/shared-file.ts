import { allowedMimeTypes } from "../records/validation";
import { fileTooLarge } from "./size";

/**
 * Which extensions the app already accepts, kept beside the MIME list so
 * both are checked. Matches the manifest's accept and the server's
 * allowedMimeTypes / extension fallback. Added here explicitly rather than
 * deriving from MIME types, so a future MIME addition cannot silently
 * drop an extension the phone relies on.
 */
const allowedExtensions = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tiff",
  ".heic",
  ".heif",
  ".txt",
] as const;

/**
 * Whether this one file is of a type the app stores.
 * Checks MIME (lower-cased) or file-name extension (lower-cased).
 * A missing MIME with a good extension still passes, because some
 * Android apps do not set the MIME reliably — the manifest therefore
 * lists both, and so does this check.
 */
export function isAllowedSharedFile(file: {
  name: string;
  type: string;
}): boolean {
  const mime = (file.type || "").toLowerCase();
  const lowerName = (file.name || "").toLowerCase();
  const allowedByMime = (allowedMimeTypes as readonly string[]).includes(mime);
  const allowedByExt = allowedExtensions.some((ext) => lowerName.endsWith(ext));
  return allowedByMime || allowedByExt;
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
