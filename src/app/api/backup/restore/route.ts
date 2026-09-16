import { currentUser } from "@/lib/auth/current-user";
import { closeDatabase } from "@/lib/db";
import { restoreEncryptedBackup } from "@/lib/backup/backup";
import { validateBackupPassword } from "@/lib/backup/constants";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await currentUser();
  } catch {
    return new Response(
      "Protected workspace – open through Cloudflare Access",
      {
        status: 401,
      },
    );
  }

  let backup: FormDataEntryValue | null;
  let password: FormDataEntryValue | null;
  try {
    const form = await request.formData();
    backup = form.get("backup");
    password = form.get("password");
  } catch {
    return Response.json(
      { error: "Choose an Estate Organiser backup and provide its password." },
      { status: 400 },
    );
  }
  const passwordError = validateBackupPassword(password);
  if (passwordError)
    return Response.json({ error: passwordError }, { status: 400 });
  if (!(backup instanceof File) || backup.size === 0)
    return Response.json(
      { error: "Choose an Estate Organiser backup file." },
      { status: 400 },
    );

  const work = await mkdtemp(join(tmpdir(), "estate-backup-upload-"));
  const inputPath = join(work, "uploaded.estate-backup");
  try {
    await writeFile(inputPath, Buffer.from(await backup.arrayBuffer()));
    const metadata = await restoreEncryptedBackup(
      inputPath,
      password as string,
      {
        closeDatabase,
      },
    );
    revalidatePath("/");
    return Response.json({ ok: true, metadata });
  } catch (error) {
    console.error(
      "[backup] restore failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      {
        error:
          "Restore failed. The existing data was kept if the replacement could not be validated. Check the password and backup file.",
      },
      { status: 400 },
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
