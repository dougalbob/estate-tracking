/**
 * The two things the contact popup needs that the rest of the app does not do
 * yet: turning a stored phone number into something a phone can dial, and
 * putting a value on the clipboard without claiming it worked until it has.
 *
 * Phone numbers are free text (`phoneNumbers` is up to ten strings of up to 80
 * characters), so a number can arrive as "0121 000 0000", "+44 121 000 0000",
 * "(0121) 000-0000" or "ask at the desk". Only the first three are dialable,
 * and guessing at a fourth would be worse than not offering the call at all.
 */

/**
 * The dialable form of a typed phone number: every space, hyphen, bracket,
 * dot and slash removed, and a leading `+` kept, because the international
 * prefix is part of the number rather than decoration around it.
 */
export function phoneForDialling(value: string): string {
  const trimmed = (value ?? "").trim();
  const prefix = trimmed.startsWith("+") ? "+" : "";
  return prefix + trimmed.replace(/\D/g, "");
}

/**
 * A `tel:` href for a stored phone number, or null when there is nothing
 * sensible to dial. Deliberately conservative: if fewer than three digits
 * remain, the number is treated as a note rather than a number, and the caller
 * offers Copy only.
 */
export function telHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = phoneForDialling(value);
  if (cleaned.replace(/\D/g, "").length < 3) return null;
  return `tel:${cleaned}`;
}

/** Whether there is anything here worth a copy button at all. */
export function canCopy(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

/**
 * `navigator.clipboard` exists only in a secure context, and writing to it can
 * still be refused (an unfocused document, a permission the user has not
 * granted). Resolves true only when the browser confirmed the write, so a
 * "Copied" message is never a guess. The clipboard is a parameter so the unit
 * tests can pass a stub; callers leave it out and get the real one.
 */
export async function copyText(
  value: string | null | undefined,
  clipboard: Clipboard | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!canCopy(value) || !clipboard?.writeText) return false;
  try {
    await clipboard.writeText(value as string);
    return true;
  } catch {
    return false;
  }
}
