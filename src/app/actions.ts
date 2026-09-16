"use server";
import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore, RecordError } from "@/lib/records/store";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
export async function saveRecord(
  kind: "organisation" | "interaction" | "task",
  input: unknown,
) {
  try {
    const user = await currentUser();
    const users = user.demo
      ? ["alex@example.invalid", "jamie@example.invalid"]
      : authConfiguration(process.env).users;
    const store = recordStore(database(), users);
    let id: string;
    switch (kind) {
      case "organisation":
        id = store.saveOrganisation(input, user.email);
        break;
      case "interaction":
        id = store.saveInteraction(input, user.email);
        break;
      case "task":
        id = store.saveTask(input, user.email);
        break;
      default:
        return {
          ok: false as const,
          error: "Unknown record type",
          code: "validation",
        };
    }
    revalidatePath("/");
    return { ok: true as const, id };
  } catch (error) {
    if (error instanceof RecordError)
      return { ok: false as const, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return {
        ok: false as const,
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "validation",
      };
    return {
      ok: false as const,
      error:
        "Unable to save. Check your access and try again. Your draft has been kept.",
      code: "unavailable",
    };
  }
}

export async function switchDemoUser(choice: string) {
  const user = await currentUser();
  if (
    !user.demo ||
    process.env.NODE_ENV !== "development" ||
    !["alex", "jamie"].includes(choice)
  )
    throw new Error("Demo switching unavailable");
  const { cookies } = await import("next/headers");
  (await cookies()).set("estate-demo-user", choice, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/");
}
