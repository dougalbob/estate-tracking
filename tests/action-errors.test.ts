import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  toActionFailure,
  zodIssueText,
} from "../src/lib/records/action-errors";
import { RecordError, versionConflict } from "../src/lib/records/errors";
import { MoneyError } from "../src/lib/finances/money";

// Every server action answers through this one mapping, so the four cases it has
// to get right are checked here rather than in fifteen places.

const fallback = "Unable to save. Check your access and try again.";

test("a refusal the app wrote reaches the browser word for word", () => {
  const failure = toActionFailure(
    new RecordError("That contact is in the bin. Restore it first."),
    fallback,
  );
  assert.deepEqual(failure, {
    ok: false,
    error: "That contact is in the bin. Restore it first.",
    code: "validation",
  });
});

test("a conflicting edit keeps its own code, so the draft is kept", () => {
  let failure;
  try {
    versionConflict();
  } catch (error) {
    failure = toActionFailure(error, fallback);
  }
  assert.equal(failure?.code, "conflict");
  assert.match(failure?.error ?? "", /changed while you were editing/);
});

test("a validation problem names the field it came from", () => {
  const schema = z.object({
    title: z.string().trim().min(1, "A title is required"),
    amount: z.string().trim().min(1, "Enter an amount"),
  });
  const parsed = schema.safeParse({ title: "", amount: "" });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const text = zodIssueText(parsed.error);
  assert.equal(text, "title: A title is required; amount: Enter an amount");
  const failure = toActionFailure(parsed.error, fallback);
  assert.equal(failure.code, "validation");
  assert.equal(failure.error, text);
});

test("a money-parsing problem is a validation problem, not a fault", () => {
  const failure = toActionFailure(
    new MoneyError("Enter an amount in pounds, for example 500 or 500.25"),
    fallback,
  );
  assert.equal(failure.code, "validation");
  assert.match(failure.error, /for example 500/);
});

test("anything unexpected becomes the caller's own sentence", () => {
  for (const error of [
    new Error("FOREIGN KEY constraint failed"),
    new TypeError("cannot read properties of undefined"),
    "a string was thrown",
    undefined,
  ]) {
    const failure = toActionFailure(error, fallback);
    assert.deepEqual(failure, {
      ok: false,
      error: fallback,
      code: "unavailable",
    });
    // The raw message must never be the one a person reads.
    assert.equal(failure.error.includes("FOREIGN KEY"), false);
  }
});
