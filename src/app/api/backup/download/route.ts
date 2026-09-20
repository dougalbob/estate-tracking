import { currentUser } from "@/lib/auth/current-user";
import { createEncryptedBackup } from "@/lib/backup/backup";
import { validateBackupPassword } from "@/lib/backup/constants";
import { APP_VERSION } from "@/lib/version";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";

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

  let password: unknown;
  try {
    password = (await request.formData()).get("password");
  } catch {
    return Response.json(
      { error: "Provide a recovery password." },
      { status: 400 },
    );
  }
  const passwordError = validateBackupPassword(password);
  if (passwordError)
    return Response.json({ error: passwordError }, { status: 400 });

  const work = await mkdtemp(join(tmpdir(), "estate-backup-download-"));
  const outputPath = join(work, "estate-organiser.estate-backup");
  try {
    const metadata = await createEncryptedBackup(
      password as string,
      outputPath,
    );
    const stream = createReadStream(outputPath);
    const cleanup = () => {
      void rm(work, { recursive: true, force: true });
    };
    stream.once("close", cleanup);
    stream.once("error", cleanup);
    const now = new Date();
    const datePart = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const timePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(now)
      .replace(":", "");
    const version = metadata.appVersion || APP_VERSION;
    const filename = `estate-backup-v${version}-${datePart}-${timePart}.estate-backup`;
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    console.error(
      "[backup] creation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      {
        error:
          "Backup could not be created. No backup should be treated as successful.",
      },
      { status: 500 },
    );
  }
}
