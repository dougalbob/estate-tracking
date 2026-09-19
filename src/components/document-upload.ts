import { uploadDocument } from "@/app/actions";
import { maxDocumentSizeBytes } from "@/lib/records/validation";
import {
  fileTooLarge as sharedFileTooLarge,
  formatSize as sharedFormatSize,
} from "@/lib/documents/size";

export type UploadResponse = {
  ok: boolean;
  id?: string;
  error?: string;
  warning?: string;
};

export const formatSize = sharedFormatSize;

/** The same size guard the upload dialog applies, reusable before queuing a file. */
export function fileTooLarge(file: { size: number }) {
  return sharedFileTooLarge(file);
}

/**
 * Send one upload, preferring the streaming route handler because it is not
 * bound by the Server Action body limit, and falling back to the action if the
 * route is missing (an older image). Shared so every upload behaves the same,
 * whichever dialog started it.
 */
export async function postDocumentUpload(
  fd: FormData,
): Promise<UploadResponse> {
  const file = fd.get("file");
  const label = String(fd.get("friendlyName") ?? "");
  if (file instanceof File) {
    console.log(
      `[upload] starting ${file.name} ${formatSize(file.size)} as ${label}`,
    );
  }
  try {
    const response = await fetch("/api/documents/upload", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      error?: string;
      warning?: string;
    };
    if (!response.ok)
      return {
        ok: false,
        error:
          body.error ||
          `Upload failed (HTTP ${response.status}). Check docker logs estate-organiser and free space (df -h /mnt/user/appdata/estate-organiser).`,
      };
    return { ok: true, id: body.id, warning: body.warning };
  } catch (fetchErr) {
    console.warn(
      "[upload] fetch to /api/documents/upload failed, falling back to server action",
      fetchErr,
    );
    // Fallback to server action (needs bodySizeLimit 25mb in next.config.ts)
    return (await uploadDocument(fd)) as UploadResponse;
  }
}

/** Turn any thrown upload error into the guidance the user needs. */
export function uploadErrorMessage(err: unknown) {
  const message =
    err instanceof Error ? err.message : String(err ?? "Unknown error");
  if (
    message.includes("413") ||
    message.toLowerCase().includes("body exceeded") ||
    message.toLowerCase().includes("too large")
  )
    return `Upload too large for server (413). Server limit is ${formatSize(maxDocumentSizeBytes)}. Check next.config.ts bodySizeLimit (now 25mb) and try a smaller file. Original: ${message}`;
  if (
    message.includes("502") ||
    message.includes("504") ||
    message.toLowerCase().includes("failed to fetch")
  )
    return `Upload failed – network/tunnel error (502/504 or fetch failure). Check container logs (docker logs estate-organiser), Cloudflare Tunnel status, and try again. Original: ${message}`;
  return `Unable to upload – ${message}. Check container logs (docker logs estate-organiser) and free space (df -h /mnt/user/appdata/estate-organiser).`;
}
