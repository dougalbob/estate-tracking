/**
 * The shared shape of every server action that writes a record.
 *
 * Each action used to repeat the same fifteen lines: work out who is calling,
 * decide which two addresses count as the users, build the store, then map
 * anything thrown into a refusal. Fourteen copies of that is fourteen chances to
 * get one of them wrong, and the copies had drifted. Now an action is only the
 * line that says what it does.
 *
 * What it guarantees, exactly as before:
 *  - identity is verified on every call, independently, and a failure to verify
 *    becomes the caller's fallback sentence rather than a save;
 *  - the page is revalidated only after the write has succeeded;
 *  - a `RecordError` reaches the browser as the sentence the store wrote, a
 *    validation problem keeps the draft, and anything unexpected is logged as a
 *    failure and reported in plain words.
 */
import { revalidatePath } from "next/cache";
import { currentUser } from "../auth/current-user";
import { authConfiguration } from "../auth/verify";
import { database } from "../db";
import { recordStore } from "./store";
import { toActionFailure } from "./action-errors";

/** The two fictional users of the isolated demo database. */
export const demoUsers = ["alex@example.invalid", "jamie@example.invalid"];

export type Store = ReturnType<typeof recordStore>;

export type ActionResult<T extends object> =
  ({ ok: true } & T) | { ok: false; error: string; code: string };

/**
 * Run one write against the store. `fallback` is the plain sentence the caller
 * wants shown if something unexpected happens, so each action can still name
 * what it was doing ("Unable to move that task…" rather than a generic failure).
 */
export async function withStore<T extends object>(
  fallback: string,
  handler: (context: { store: Store; actor: string }) => T | Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const user = await currentUser();
    const users = user.demo ? demoUsers : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    const result = await handler({ store, actor: user.email });
    revalidatePath("/");
    return { ok: true, ...result };
  } catch (error) {
    const failure = toActionFailure(error, fallback);
    // A refusal the app wrote for a person is not a fault; anything else is
    // worth a line in the container log, which is where the README's
    // troubleshooting steps send you.
    if (failure.code === "unavailable")
      console.error("[action] unexpected failure", error);
    return failure;
  }
}
