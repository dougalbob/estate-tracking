import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedSharedFile,
  preferredSharedFile,
} from "../src/lib/documents/shared-file";

// A shared file is whatever the phone hands over. For the test a plain
// object with name, type and size is enough – the helper never touches the
// disk, it only decides whether the app stores this kind of file.

function file(overrides: { name: string; type: string; size?: number }) {
  return {
    name: overrides.name,
    type: overrides.type,
    size: overrides.size ?? 1024,
  };
}

test("a PDF is accepted whether by MIME or by extension", () => {
  assert.equal(
    isAllowedSharedFile(file({ name: "scan.pdf", type: "application/pdf" })),
    true,
  );
  // Some Android apps omit the MIME but keep the extension – that must pass too.
  assert.equal(isAllowedSharedFile(file({ name: "scan.pdf", type: "" })), true);
  // MIME alone without a filename is still accepted.
  assert.equal(
    isAllowedSharedFile(file({ name: "", type: "application/pdf" })),
    true,
  );
});

test("the image types the app stores are accepted, a Word file is not", () => {
  for (const f of [
    file({ name: "photo.jpg", type: "image/jpeg" }),
    file({ name: "photo.jpeg", type: "image/jpeg" }),
    file({ name: "photo.png", type: "image/png" }),
    file({ name: "scan.webp", type: "image/webp" }),
    file({ name: "scan.tiff", type: "image/tiff" }),
    file({ name: "scan.heic", type: "image/heic" }),
    file({ name: "scan.heif", type: "image/heif" }),
    file({ name: "notes.txt", type: "text/plain" }),
  ]) {
    assert.equal(
      isAllowedSharedFile(f),
      true,
      `${f.name} ${f.type} should be allowed`,
    );
  }

  // A .docx is the very file that must be refused with a plain sentence.
  const docx = file({
    name: "letter.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.equal(isAllowedSharedFile(docx), false);
  assert.equal(preferredSharedFile([docx]), null);
});

test("a HEIC with no MIME is accepted by its extension", () => {
  // The share-target and the manifest both accept HEIC/HEIF, and some Android
  // apps hand the file over with a generic or missing MIME. The upload paths
  // used to refuse exactly this case because their hand-copied extension list
  // omitted .heic — the one list now decides for all of them.
  assert.equal(
    isAllowedSharedFile(file({ name: "IMG_0001.heic", type: "" })),
    true,
  );
  assert.equal(
    isAllowedSharedFile(
      file({ name: "IMG_0001.heic", type: "application/octet-stream" }),
    ),
    true,
  );
  assert.equal(
    isAllowedSharedFile(file({ name: "photo.heif", type: "" })),
    true,
  );
});

test("an SVG is refused however it arrives", () => {
  // An SVG can carry scripts and documents are served from the app's own
  // origin, so it is not stored — by MIME, by extension, and even when the
  // name claims a stored extension while the MIME says SVG.
  assert.equal(
    isAllowedSharedFile(file({ name: "drawing.svg", type: "image/svg+xml" })),
    false,
  );
  assert.equal(isAllowedSharedFile(file({ name: "drawing.svg", type: "" })), false);
  assert.equal(
    isAllowedSharedFile(file({ name: "photo.png", type: "image/svg+xml" })),
    false,
  );
  assert.equal(
    preferredSharedFile([
      file({ name: "drawing.svg", type: "image/svg+xml" }),
      file({ name: "scan.pdf", type: "application/pdf" }),
    ])?.name,
    "scan.pdf",
  );
});

test("preferredSharedFile takes the first acceptable and mentions ignored", () => {
  const pdf1 = file({ name: "first.pdf", type: "application/pdf" });
  const pdf2 = file({ name: "second.pdf", type: "application/pdf" });
  // Helper picks the first; the caller tells the user how many were ignored.
  assert.equal(preferredSharedFile([pdf1, pdf2]), pdf1);
  assert.equal(preferredSharedFile([pdf2, pdf1]), pdf2);
});

test("preferredSharedFile skips an unsupported type and takes the next", () => {
  const docx = file({
    name: "letter.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const pdf = file({ name: "scan.pdf", type: "application/pdf" });
  // The share contained a Word file first – the app ignores it and uses the PDF.
  assert.equal(preferredSharedFile([docx, pdf]), pdf);
  assert.equal(preferredSharedFile([docx]), null);
});

test("empty share returns null", () => {
  assert.equal(preferredSharedFile([]), null);
});

test("a file larger than 20 MB is refused, even if the type is allowed", () => {
  const tooLarge = file({
    name: "huge.pdf",
    type: "application/pdf",
    size: 21 * 1024 * 1024,
  });
  const small = file({
    name: "small.pdf",
    type: "application/pdf",
    size: 1024,
  });
  // A share that is only a too-large file is refused outright.
  assert.equal(preferredSharedFile([tooLarge]), null);
  // If the first is too large but the second is small, the second is used.
  assert.equal(preferredSharedFile([tooLarge, small]), small);
  // Exactly 20 MB is still allowed; one byte more is not (limit lives in one place).
  const atLimit = file({
    name: "limit.pdf",
    type: "application/pdf",
    size: 20 * 1024 * 1024,
  });
  const overLimit = file({
    name: "over.pdf",
    type: "application/pdf",
    size: 20 * 1024 * 1024 + 1,
  });
  assert.equal(preferredSharedFile([atLimit]), atLimit);
  assert.equal(preferredSharedFile([overLimit]), null);
});

test("extension is lower-cased before comparison", () => {
  assert.equal(isAllowedSharedFile(file({ name: "SCAN.PDF", type: "" })), true);
  assert.equal(
    isAllowedSharedFile(file({ name: "Photo.JPG", type: "" })),
    true,
  );
  assert.equal(
    isAllowedSharedFile(file({ name: "notes.TXT", type: "" })),
    true,
  );
});

test("unsupported extension with no MIME is refused", () => {
  assert.equal(
    isAllowedSharedFile(file({ name: "movie.mp4", type: "" })),
    false,
  );
  assert.equal(
    isAllowedSharedFile(file({ name: "archive.zip", type: "" })),
    false,
  );
});
