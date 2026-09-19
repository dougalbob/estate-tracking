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
    if (!response.ok) {
      // The plain sentence is what the user sees; the status stays in the
      // browser console for anyone following the README troubleshooting steps.
      console.warn(`[upload] HTTP ${response.status}`, body.error ?? "");
      return {
        ok: false,
        error: body.error || "The upload did not complete. Please try again.",
      };
    }
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

/**
 * Turn any thrown upload error into the guidance the user needs. The wording
 * stays calm and offers a next step; the technical detail goes to the browser
 * console, and the README's troubleshooting section explains what to check on
 * the server (container logs, free disk space, Cloudflare Tunnel) if an upload
 * keeps failing.
 */
export function uploadErrorMessage(err: unknown) {
  const message =
    err instanceof Error ? err.message : String(err ?? "Unknown error");
  console.warn("[upload] failed:", message);
  if (
    message.includes("413") ||
    message.toLowerCase().includes("body exceeded") ||
    message.toLowerCase().includes("too large")
  )
    return `That file is too large to upload. The limit is ${formatSize(maxDocumentSizeBytes)}.`;
  if (
    message.includes("502") ||
    message.includes("504") ||
    message.toLowerCase().includes("failed to fetch")
  )
    return "The connection was interrupted. Check your internet connection and try again.";
  return "The upload did not complete. Please try again.";
}
