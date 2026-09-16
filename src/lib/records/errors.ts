/**
 * Errors that are safe to show to a signed-in user. Anything else is treated as
 * an unexpected failure by the server actions.
 */
export class RecordError extends Error {
  constructor(
    message: string,
    public code = "validation",
  ) {
    super(message);
  }
}

/**
 * Raised when a record changed while someone was editing it. The draft is kept
 * in the browser so the losing edit can be reviewed rather than overwritten.
 */
export function versionConflict(): never {
  throw new RecordError(
    "This record changed while you were editing. Your draft is still here. Review the latest version before trying again.",
    "conflict",
  );
}

export function assertActor(users: string[], actor: string) {
  if (!users.includes(actor))
    throw new RecordError("Unauthorised user", "auth");
}
