import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareUpload,
  readUploadLinks,
  uploadSentences,
} from "../src/lib/documents/upload-validation";
import { maxDocumentSizeBytes } from "../src/lib/records/validation";
import { formatSize } from "../src/lib/documents/size";

// The rule both upload paths read. What matters is that it refuses for the
// reasons the app says it refuses for, in the sentences a person reads, and that
// the file the phone shares with no MIME type still gets through.

function formDataWith(
  file: File | string | null,
  fields: Record<string, string> = {},
) {
  const formData = new FormData();
  if (file !== null) formData.set("file", file as string | Blob);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function fileOfSize(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  // A real 21 MB buffer in a unit test buys nothing: the rule compares the size
  // the browser reports, so report the size we mean to test.
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

test("no file at all is refused in one plain sentence", () => {
  for (const formData of [
    formDataWith(null),
    formDataWith(""),
    formDataWith(new File([], "empty.pdf", { type: "application/pdf" })),
  ]) {
    const result = prepareUpload(formData);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.rejection.error, uploadSentences.noFile);
    assert.equal(result.rejection.status, 400);
  }
});

test("a file over the limit is refused, naming the limit", () => {
  const result = prepareUpload(
    formDataWith(
      fileOfSize("scan.pdf", "application/pdf", maxDocumentSizeBytes + 1),
    ),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.rejection.status, 413);
  assert.equal(
    result.rejection.error,
    `That file is too large to upload. The limit is ${formatSize(maxDocumentSizeBytes)}.`,
  );
  // A file exactly at the limit is allowed, as it always has been.
  const atLimit = prepareUpload(
    formDataWith(
      fileOfSize("scan.pdf", "application/pdf", maxDocumentSizeBytes),
    ),
  );
  assert.equal(atLimit.ok, true);
});

test("the types the app stores are accepted, and a Word file is not", () => {
  const accepted = prepareUpload(
    formDataWith(new File(["x"], "letter.pdf", { type: "application/pdf" })),
  );
  assert.equal(accepted.ok, true);
  const refused = prepareUpload(
    formDataWith(
      new File(["x"], "letter.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ),
  );
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.rejection.error, uploadSentences.unsupportedType);
  assert.equal(refused.rejection.status, 400);
});

test("an SVG is refused however it arrives", () => {
  for (const file of [
    new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
    // No MIME, but the extension gives it away.
    new File(["<svg/>"], "logo.svg", { type: "" }),
  ]) {
    const result = prepareUpload(formDataWith(file));
    assert.equal(
      result.ok,
      false,
      `${file.name} (${file.type}) should be refused`,
    );
    if (result.ok) continue;
    assert.equal(result.rejection.error, uploadSentences.unsupportedType);
  }
});

test("a HEIC shared with no MIME type is accepted", () => {
  // This is the bug the shared rule exists to prevent: Android apps often hand
  // over a generic MIME, and a hand-copied extension list once refused the file
  // the share sheet had just accepted.
  for (const name of ["photo.heic", "photo.HEIC", "photo.heif"]) {
    const result = prepareUpload(
      formDataWith(new File(["x"], name, { type: "application/octet-stream" })),
    );
    assert.equal(result.ok, true, `${name} should be accepted`);
  }
});

test("the friendly name comes from the form, or from the file name", () => {
  const named = prepareUpload(
    formDataWith(
      new File(["x"], "scan-0001.pdf", { type: "application/pdf" }),
      {
        friendlyName: "Solicitor letter",
        category: "correspondence",
      },
    ),
  );
  assert.equal(named.ok, true);
  if (named.ok) {
    assert.equal(named.upload.friendlyName, "Solicitor letter");
    assert.equal(named.upload.category, "correspondence");
  }
  const derived = prepareUpload(
    formDataWith(new File(["x"], "scan-0001.pdf", { type: "application/pdf" })),
  );
  assert.equal(derived.ok, true);
  if (derived.ok) {
    // The extension is dropped, because the row shows the real file name too.
    assert.equal(derived.upload.friendlyName, "scan-0001");
    assert.equal(derived.upload.category, null);
  }
});

test("a friendly name that is too long is refused rather than truncated", () => {
  const result = prepareUpload(
    formDataWith(new File(["x"], "scan.pdf", { type: "application/pdf" }), {
      friendlyName: "x".repeat(400),
    }),
  );
  assert.equal(result.ok, false);
});

test("the optional links are read, and only counted when there is one", () => {
  const bare = prepareUpload(
    formDataWith(new File(["x"], "scan.pdf", { type: "application/pdf" })),
  );
  assert.equal(bare.ok, true);
  if (bare.ok) assert.equal(bare.upload.hasLink, false);

  const linked = prepareUpload(
    formDataWith(new File(["x"], "scan.pdf", { type: "application/pdf" }), {
      taskId: "task-1",
      category: "receipt",
    }),
  );
  assert.equal(linked.ok, true);
  if (linked.ok) {
    assert.equal(linked.upload.hasLink, true);
    assert.equal(linked.upload.links.taskId, "task-1");
    assert.equal(linked.upload.links.organisationId, null);
  }
  assert.deepEqual(readUploadLinks(formDataWith(null)), {
    organisationId: null,
    interactionId: null,
    taskId: null,
    projectId: null,
    financeRecordId: null,
  });
});

test("a browser that reports no MIME still gets a stored type", () => {
  const result = prepareUpload(
    formDataWith(new File(["x"], "notes.txt", { type: "" })),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.upload.mime, "application/octet-stream");
});

test("the sentences say what to do next, and name no server", () => {
  for (const sentence of Object.values(uploadSentences)) {
    assert.equal(typeof sentence, "string");
    assert.ok(sentence.length > 10, sentence);
    for (const forbidden of ["docker", "df -h", "/mnt/", "Arena", "preview"])
      assert.equal(
        sentence.toLowerCase().includes(forbidden),
        false,
        `"${sentence}" should not mention ${forbidden}`,
      );
  }
});

test("an upload carries the date printed on the document, and blank means none", () => {
  const file = new File(["x"], "deed.pdf", { type: "application/pdf" });
  const dated = prepareUpload(
    formDataWith(file, {
      friendlyName: "House deed",
      documentDate: "1987-09-03",
    }),
  );
  assert.equal(dated.ok, true);
  if (dated.ok) assert.equal(dated.upload.documentDate, "1987-09-03");
  // No field at all, and a field submitted empty, both mean "the date it was
  // added" rather than a date nobody chose.
  for (const fields of [
    { friendlyName: "House deed" },
    { friendlyName: "House deed", documentDate: "" },
  ] as Record<string, string>[]) {
    const plain = prepareUpload(formDataWith(file, fields));
    assert.equal(plain.ok, true);
    if (plain.ok) assert.equal(plain.upload.documentDate, null);
  }
  // A date that is not a day is refused in the one plain sentence every date
  // field uses; the upload writes nothing.
  const refused = prepareUpload(
    formDataWith(file, {
      friendlyName: "House deed",
      documentDate: "3/9/1987",
    }),
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.rejection.error, "Enter a valid date");
    assert.equal(refused.rejection.status, 400);
  }
});
