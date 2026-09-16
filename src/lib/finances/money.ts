/**
 * Money helpers. The estate is GBP only, and every amount is stored, added and
 * compared as an integer number of pence. Pounds are only ever a display or an
 * input format – no floating-point arithmetic is used on amounts.
 */
export class MoneyError extends Error {}

/** £1,000.50 typed by a person, with the noise we can safely ignore. */
const POUNDS_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

export function parsePoundsToPence(input: string): number {
  const cleaned = input
    .replace(/[£\s,]/g, "")
    .replace(/\u00a0/g, "")
    .trim();
  if (!cleaned) throw new MoneyError("Enter an amount");
  if (/^[+-]/.test(cleaned))
    throw new MoneyError("Enter an amount without a minus or plus sign");
  const match = POUNDS_PATTERN.exec(cleaned);
  if (!match)
    throw new MoneyError(
      "Enter an amount in pounds, for example 500 or 500.25 (up to two decimal places)",
    );
  const pounds = Number(match[1]);
  const pence = Number((match[2] ?? "").padEnd(2, "0") || "0");
  return pounds * 100 + pence;
}

/** Blank means "no amount recorded yet" (only assets allow that). */
export function optionalPoundsToPence(input: string | null | undefined) {
  if (input === null || input === undefined) return null;
  if (!input.trim()) return null;
  return parsePoundsToPence(input);
}

export function sumPence(values: (number | null | undefined)[]) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** £1,234.56 – always two decimal places, always the pound sign. */
export function formatPence(pence: number | null | undefined) {
  if (pence === null || pence === undefined) return "Not recorded";
  const sign = pence < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(pence));
  const pounds = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}£${pounds.toLocaleString("en-GB")}.${String(remainder).padStart(2, "0")}`;
}

/** 1234.56 for CSV cells: no symbol, no thousands separator. */
export function formatPencePlain(pence: number | null | undefined) {
  if (pence === null || pence === undefined) return "";
  const sign = pence < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(pence));
  const pounds = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}${pounds}.${String(remainder).padStart(2, "0")}`;
}
