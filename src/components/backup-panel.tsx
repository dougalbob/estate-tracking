"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Download, ShieldCheck, Upload } from "lucide-react";
import { minimumBackupPasswordLength } from "@/lib/backup/constants";
import { Button } from "./ui/button";

export function BackupPanel() {
  const router = useRouter();
  const restoreForm = useRef<HTMLFormElement>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createBackup(form: HTMLFormElement) {
    setCreating(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/backup/download", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error || `Backup failed (HTTP ${response.status})`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `estate-organiser-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.estate-backup`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 5000);
      form.reset();
      setMessage(
        "The encrypted backup was created and a download was requested. Keep the downloaded file and recovery password together but separately from the server.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backup failed.");
    } finally {
      setCreating(false);
    }
  }

  async function restoreBackup(form: HTMLFormElement) {
    const file = (form.elements.namedItem("backup") as HTMLInputElement | null)
      ?.files?.[0];
    if (!file) {
      setError("Choose an Estate Organiser backup file first.");
      return;
    }
    if (
      !window.confirm(
        "Restore this backup? Current database records and documents will be replaced by the validated backup. This cannot be undone from the app.",
      )
    )
      return;

    setRestoring(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error || "Restore failed.");
      setMessage("Restore completed. Reloading the workspace…");
      router.refresh();
      window.setTimeout(() => window.location.reload(), 250);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="backup-layout">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CREATE A RECOVERY COPY</p>
            <h2>Encrypted backup</h2>
          </div>
          <ShieldCheck size={24} />
        </div>
        <p>
          The backup takes a consistent SQLite snapshot and includes the stored
          documents. It is encrypted before it leaves the server; the app does
          not save your recovery password or keep a completed backup on the
          server.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createBackup(event.currentTarget);
          }}
          className="form-fields"
          style={{ padding: "16px 0 0" }}
        >
          <label>
            Recovery password
            <input
              name="password"
              type="password"
              minLength={minimumBackupPasswordLength}
              autoComplete="new-password"
              required
            />
          </label>
          <p className="form-help">
            Use at least {minimumBackupPasswordLength} characters. Keep it in a
            password manager; losing it makes this backup unrecoverable.
          </p>
          <Button type="submit" disabled={creating || restoring}>
            <Download size={17} />
            {creating ? "Creating backup…" : "Create encrypted backup"}
          </Button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">USE A RECOVERY COPY</p>
            <h2>Restore backup</h2>
          </div>
          <ArchiveRestore size={24} />
        </div>
        <p>
          Restore is for a clean recovery or replacement installation. The
          existing database and documents are only replaced after the password,
          encryption tag, archive structure, and SQLite integrity have passed.
        </p>
        <form
          ref={restoreForm}
          onSubmit={(event) => {
            event.preventDefault();
            void restoreBackup(event.currentTarget);
          }}
          className="form-fields"
          style={{ padding: "16px 0 0" }}
        >
          <label>
            Estate Organiser backup file
            <input
              name="backup"
              type="file"
              accept=".estate-backup,application/octet-stream"
              required
            />
          </label>
          <label>
            Recovery password
            <input
              name="password"
              type="password"
              minLength={minimumBackupPasswordLength}
              autoComplete="new-password"
              required
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={creating || restoring}
          >
            <Upload size={17} />
            {restoring ? "Restoring…" : "Validate and restore"}
          </Button>
        </form>
      </section>

      <aside className="panel backup-note">
        <h2>Safe handling</h2>
        <ul>
          <li>
            Download to your own device, then copy it to your chosen storage.
          </li>
          <li>
            Keep the password outside the backup file and outside the app.
          </li>
          <li>
            Keep more than one dated backup; the app keeps no server backup
            retention copy.
          </li>
          <li>
            Do not treat a backup as tested until it has restored into a clean
            installation.
          </li>
        </ul>
      </aside>

      {(message || error) && (
        <div
          className={error ? "form-error" : "success-message"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </div>
      )}
    </div>
  );
}
