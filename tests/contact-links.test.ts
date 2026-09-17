import assert from "node:assert/strict";
import test from "node:test";
import {
  canCopy,
  copyText,
  phoneForDialling,
  telHref,
} from "../src/lib/contacts/contact-links";

// The popup dials and copies values a person typed as free text, so these
// tests are all about the untidy cases rather than the tidy ones.
test("phone numbers are dialled as digits with the international prefix kept", () => {
  assert.equal(phoneForDialling("0121 000 0000"), "01210000000");
  assert.equal(phoneForDialling("+44 121 000 0000"), "+441210000000");
  assert.equal(phoneForDialling("(0121) 000-0000"), "01210000000");
  assert.equal(phoneForDialling("0121.000.0000"), "01210000000");
  assert.equal(phoneForDialling("  0121 000 0000  "), "01210000000");
  assert.equal(phoneForDialling("0121 000 0000 ext 4"), "012100000004");
  // A `+` typed anywhere but the start is decoration, not a prefix.
  assert.equal(phoneForDialling("call +44 121 000 0000"), "441210000000");
});

test("telHref gives a callable link for a real number", () => {
  assert.equal(telHref("0121 000 0000"), "tel:01210000000");
  assert.equal(telHref("+44 121 000 0000"), "tel:+441210000000");
  assert.equal(telHref("0300 123 1000"), "tel:03001231000");
  assert.equal(telHref("+44 (0)121 000 0000"), "tel:+4401210000000");
});

test("telHref refuses to invent a number from words", () => {
  assert.equal(telHref("ask at the desk"), null);
  assert.equal(telHref("option 2"), null);
  assert.equal(telHref("42"), null);
  assert.equal(telHref(""), null);
  assert.equal(telHref(null), null);
  assert.equal(telHref(undefined), null);
});

test("three digits are enough to offer a call", () => {
  assert.equal(telHref("999"), "tel:999");
});

test("a copy button only appears where there is something to copy", () => {
  assert.equal(canCopy("name@example.invalid"), true);
  assert.equal(canCopy("0121 000 0000"), true);
  assert.equal(canCopy(""), false);
  assert.equal(canCopy("   "), false);
  assert.equal(canCopy(null), false);
  assert.equal(canCopy(undefined), false);
});

test("copyText confirms only what the clipboard actually accepted", async () => {
  const written: string[] = [];
  const ok = {
    writeText: async (value: string) => {
      written.push(value);
    },
  } as unknown as Clipboard;
  assert.equal(await copyText("0121 000 0000", ok), true);
  assert.deepEqual(written, ["0121 000 0000"]);
});

test("copyText reports failure instead of throwing", async () => {
  const denied = {
    writeText: async () => {
      throw new DOMException("Document is not focused");
    },
  } as unknown as Clipboard;
  assert.equal(await copyText("name@example.invalid", denied), false);
});

test("copyText copes with no clipboard at all (insecure context)", async () => {
  assert.equal(await copyText("REF-123", undefined), false);
  assert.equal(await copyText("REF-123", {} as Clipboard), false);
});

test("nothing is written for an empty value", async () => {
  const written: string[] = [];
  const ok = {
    writeText: async (value: string) => {
      written.push(value);
    },
  } as unknown as Clipboard;
  assert.equal(await copyText(null, ok), false);
  assert.equal(await copyText("  ", ok), false);
  assert.deepEqual(written, []);
});
