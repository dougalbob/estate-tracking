import { maxDocumentSizeBytes } from "../records/validation";

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** The same size guard the upload dialog applies, reusable before queuing a file. */
export function fileTooLarge(file: { size: number }) {
  return file.size > maxDocumentSizeBytes
    ? `File too large – ${formatSize(file.size)} exceeds ${formatSize(maxDocumentSizeBytes)} limit. Try a smaller file or compress the scan.`
    : "";
}
