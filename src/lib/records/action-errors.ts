/**
 * The one mapping from a thrown error to the shape every server action returns.
 *
 * It used to be pasted into all fifteen actions, and the copies had quietly
 * drifted: some named the field a validation problem came from and some did not,
 * and only one recognised a money-parsing error at all. One copy means one
 * answer, and a new action gets it for free.
 *
 * The rule is unchanged from the original: a `RecordError` is a sentence the app
 * wrote for a person, a `ZodError` or `MoneyError` is a validation problem with
 * the draft still in the browser, and anything else is an unexpected failure
 * that gets the caller's own fallback sentence — never a stack trace.
 */
import { ZodError } from "zod";
import { RecordError } from "./errors";
import { MoneyError } from "../finances/money";

export type ActionFailure = {
  ok: false;
  error: string;
  code: string;
};

/**
 * What went wrong with a draft, with the field named. "amount: Enter an amount"
 * tells someone which box to look at; the message on its own often does not.
 */
export function zodIssueText(error: ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");
}

/**
 * Turn anything thrown inside an action into a refusal that is safe to show.
 * `fallback` is the caller's own plain sentence for an unexpected failure, so
 * each action can still say what it was trying to do.
 */
export function toActionFailure(
  error: unknown,
  fallback: string,
): ActionFailure {
  if (error instanceof RecordError)
    return { ok: false, error: error.message, code: error.code };
  if (error instanceof ZodError)
    return { ok: false, error: zodIssueText(error), code: "validation" };
  if (error instanceof MoneyError)
    return { ok: false, error: error.message, code: "validation" };
  return { ok: false, error: fallback, code: "unavailable" };
}
