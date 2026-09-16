/**
 * Small CSV writer for spreadsheet exports.
 *
 * Spreadsheets treat a cell beginning with = + - @ (or a tab/carriage return) as
 * a formula, which is a known way for text in an export to run when the file is
 * opened. Every cell is therefore quoted, and any cell whose value could be read
 * as a formula is prefixed with an apostrophe so it stays plain text.
 *
 * Money is exported as a plain decimal in pounds (for example 1234.56) with no
 * sign in front: money in and money out get separate columns instead of
 * negative numbers, which keeps every amount a real number in the spreadsheet.
 */
export type CsvRow = (string | number | null | undefined)[];

const FORMULA_START = /^[\s\u00a0]*[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value) : value;
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvDocument(rows: CsvRow[]): string {
  return (
    rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\r\n") +
    "\r\n"
  );
}

/**
 * A byte order mark helps Excel read £ and accented names correctly. It is
 * invisible to other spreadsheet programs.
 */
export function csvFile(rows: CsvRow[]): string {
  return `\uFEFF${csvDocument(rows)}`;
}

export function csvFilename(prefix: string, today: string) {
  return `estate-finances-${prefix}-${today}.csv`;
}
