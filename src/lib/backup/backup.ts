import Database from "better-sqlite3";
import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  createReadStream as createReadStreamSync,
  createWriteStream,
  existsSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { documentsPath } from "@/lib/documents/storage";
import {
  minimumBackupPasswordLength,
  validateBackupPassword,
} from "./constants";

const BACKUP_MAGIC = Buffer.from("ESTATE-ORGANISER-BACKUP\0");
const ARCHIVE_MAGIC = Buffer.from("ESTATE-ORGANISER-ARCHIVE\0");
const FORMAT_VERSION = 1;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_ENTRIES = 100_000;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024 * 1024;
const REQUIRED_TABLES = [
  "organisations",
  "projects",
  "interactions",
  "tasks",
  "documents",
  "document_links",
  "finance_records",
  "finance_movements",
  "task_templates",
  "revisions",
];

export type BackupMetadata = {
  formatVersion: number;
  createdAt: string;
  databaseBytes: number;
  documentFiles: number;
  documentBytes: number;
};

type BackupHeader = {
  formatVersion: number;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  authTagBytes: number;
  scrypt: { n: number; r: number; p: number };
};

type FileEntry = {
  name: string;
  path: string;
  size: number;
};

type StagedRestore = {
  root: string;
  databasePath: string;
  documentsPath: string;
  metadata: BackupMetadata;
};

export function estateDatabasePath(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "development" && env.DEV_AUTH_ENABLED === "true") {
    return "./data/demo.sqlite";
  }
  return env.DATABASE_PATH || "./data/estate.sqlite";
}

function passwordKey(password: string, salt: Buffer) {
  return scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
}

function uint32(value: number) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(value, 0);
  return result;
}

function uint64(value: number) {
  const result = Buffer.alloc(8);
  result.writeBigUInt64LE(BigInt(value), 0);
  return result;
}

function entryHeader(name: string, size: number) {
  const nameBytes = Buffer.from(name, "utf8");
  if (nameBytes.length > 4096) throw new Error("Backup entry name is too long");
  return Buffer.concat([uint32(nameBytes.length), uint64(size), nameBytes]);
}

function validArchiveName(name: string) {
  if (
    !name ||
    name.includes("\0") ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.split("/").some((part) => part === ".." || part === "")
  )
    return false;
  return name === "database/estate.sqlite" || name.startsWith("documents/");
}

async function collectDocumentFiles(root: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  if (!existsSync(root)) return entries;

  async function visit(directory: string) {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const path = join(directory, child.name);
      if (child.isDirectory()) {
        await visit(path);
      } else if (child.isFile()) {
        const relativeName = relative(root, path).split("\\").join("/");
        const name = `documents/${relativeName}`;
        if (!validArchiveName(name)) throw new Error("Unsafe document path");
        const details = await stat(path);
        if (details.size > MAX_ENTRY_BYTES)
          throw new Error("A document is too large to back up");
        entries.push({ name, path, size: details.size });
      } else if (child.isSymbolicLink()) {
        throw new Error(
          "Symbolic links are not allowed in the documents folder",
        );
      }
    }
  }

  await visit(root);
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function* fileChunks(entry: FileEntry) {
  if (entry.size === 0) return;
  const stream = createReadStreamSync(entry.path, {
    start: 0,
    end: entry.size - 1,
  });
  let read = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    read += bytes.length;
    yield bytes;
  }
  if (read !== entry.size) {
    throw new Error(`File changed while backing up: ${entry.name}`);
  }
}

async function* archiveChunks(
  databaseSnapshot: FileEntry,
  documents: FileEntry[],
  metadata: BackupMetadata,
) {
  const metadataBytes = Buffer.from(JSON.stringify(metadata), "utf8");
  const entries = [
    { name: "metadata.json", path: "", size: metadataBytes.length },
    databaseSnapshot,
    ...documents,
  ];
  yield ARCHIVE_MAGIC;
  yield uint32(entries.length);
  yield entryHeader("metadata.json", metadataBytes.length);
  yield metadataBytes;
  for (const entry of [databaseSnapshot, ...documents]) {
    yield entryHeader(entry.name, entry.size);
    yield* fileChunks(entry);
  }
}

async function beginSQLiteSnapshot(databasePath: string, snapshotPath: string) {
  const lock = new Database(databasePath, {
    fileMustExist: true,
  });
  lock.pragma("busy_timeout = 10000");
  lock.pragma("foreign_keys = ON");
  lock.exec("BEGIN IMMEDIATE");
  const snapshotSource = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    // The read connection performs the backup; the immediate transaction on
    // the lock connection prevents application writes while documents and the
    // SQLite snapshot are collected.
    await snapshotSource.backup(snapshotPath);
    snapshotSource.close();
  } catch (error) {
    snapshotSource.close();
    try {
      lock.exec("ROLLBACK");
    } finally {
      lock.close();
    }
    throw error;
  }
  return lock;
}

export async function createEncryptedBackup(
  password: string,
  outputPath: string,
  options: {
    databasePath?: string;
    documentsRoot?: string;
  } = {},
): Promise<BackupMetadata> {
  const passwordError = validateBackupPassword(password);
  if (passwordError) throw new Error(passwordError);

  const databasePath = options.databasePath || estateDatabasePath();
  const documentsRoot = options.documentsRoot || documentsPath();
  const work = await mkdtemp(join(tmpdir(), "estate-backup-"));
  const snapshotPath = join(work, "estate.sqlite");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const header: BackupHeader = {
    formatVersion: FORMAT_VERSION,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    authTagBytes: AUTH_TAG_BYTES,
    scrypt: { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const sqlite = await beginSQLiteSnapshot(databasePath, snapshotPath);

  try {
    const databaseDetails = await stat(snapshotPath);
    const documents = await collectDocumentFiles(documentsRoot);
    const metadata: BackupMetadata = {
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      databaseBytes: databaseDetails.size,
      documentFiles: documents.length,
      documentBytes: documents.reduce((total, file) => total + file.size, 0),
    };
    const databaseEntry: FileEntry = {
      name: "database/estate.sqlite",
      path: snapshotPath,
      size: databaseDetails.size,
    };
    const outerHeader = Buffer.concat([
      BACKUP_MAGIC,
      uint32(headerBytes.length),
      headerBytes,
    ]);
    await writeFile(outputPath, outerHeader);
    const cipher = createCipheriv(
      "aes-256-gcm",
      passwordKey(password, salt),
      iv,
    );
    cipher.setAAD(headerBytes);
    await pipeline(
      Readable.from(archiveChunks(databaseEntry, documents, metadata)),
      cipher,
      createWriteStream(outputPath, { flags: "a" }),
    );
    await appendFile(outputPath, cipher.getAuthTag());
    sqlite.exec("COMMIT");
    return metadata;
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}
    try {
      await rm(outputPath, { force: true });
    } catch {}
    throw error;
  } finally {
    sqlite.close();
    await rm(work, { recursive: true, force: true });
  }
}

async function readAt(
  file: Awaited<ReturnType<typeof open>>,
  position: number,
  size: number,
) {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await file.read(
      buffer,
      offset,
      size - offset,
      position + offset,
    );
    if (result.bytesRead === 0) throw new Error("Backup is truncated");
    offset += result.bytesRead;
  }
  return buffer;
}

async function inspectOuterHeader(path: string) {
  const file = await open(path, "r");
  try {
    const details = await file.stat();
    if (details.size < BACKUP_MAGIC.length + 4 + AUTH_TAG_BYTES)
      throw new Error("Backup file is too small");
    const magic = await readAt(file, 0, BACKUP_MAGIC.length);
    if (!magic.equals(BACKUP_MAGIC))
      throw new Error("Not an Estate Organiser backup");
    const headerLength = (
      await readAt(file, BACKUP_MAGIC.length, 4)
    ).readUInt32LE(0);
    if (headerLength < 2 || headerLength > MAX_HEADER_BYTES)
      throw new Error("Backup header is invalid");
    const headerStart = BACKUP_MAGIC.length + 4;
    const headerBytes = await readAt(file, headerStart, headerLength);
    let header: BackupHeader;
    try {
      header = JSON.parse(headerBytes.toString("utf8")) as BackupHeader;
    } catch {
      throw new Error("Backup header cannot be read");
    }
    if (
      header.formatVersion !== FORMAT_VERSION ||
      header.algorithm !== "aes-256-gcm" ||
      header.kdf !== "scrypt" ||
      header.authTagBytes !== AUTH_TAG_BYTES ||
      header.scrypt?.n !== SCRYPT_N ||
      header.scrypt?.r !== SCRYPT_R ||
      header.scrypt?.p !== SCRYPT_P
    )
      throw new Error("Unsupported backup format");
    const ciphertextStart = headerStart + headerLength;
    const tagStart = details.size - AUTH_TAG_BYTES;
    if (tagStart <= ciphertextStart)
      throw new Error("Backup has no encrypted payload");
    const tag = await readAt(file, tagStart, AUTH_TAG_BYTES);
    return { details, header, headerBytes, ciphertextStart, tagStart, tag };
  } finally {
    await file.close();
  }
}

async function decryptPayload(
  inputPath: string,
  archivePath: string,
  password: string,
) {
  const parsed = await inspectOuterHeader(inputPath);
  const salt = Buffer.from(parsed.header.salt, "base64url");
  const iv = Buffer.from(parsed.header.iv, "base64url");
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES)
    throw new Error("Backup encryption parameters are invalid");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    passwordKey(password, salt),
    iv,
  );
  decipher.setAAD(parsed.headerBytes);
  decipher.setAuthTag(parsed.tag);
  await pipeline(
    createReadStreamSync(inputPath, {
      start: parsed.ciphertextStart,
      end: parsed.tagStart - 1,
    }),
    decipher,
    createWriteStream(archivePath),
  );
}

async function copyRange(
  sourcePath: string,
  destinationPath: string,
  start: number,
  size: number,
) {
  await mkdir(dirname(destinationPath), { recursive: true });
  if (size === 0) {
    await writeFile(destinationPath, Buffer.alloc(0));
    return;
  }
  await pipeline(
    createReadStreamSync(sourcePath, { start, end: start + size - 1 }),
    createWriteStream(destinationPath),
  );
}

async function parseArchive(
  archivePath: string,
  root: string,
): Promise<StagedRestore> {
  const file = await open(archivePath, "r");
  const databaseStage = join(root, "database", "estate.sqlite");
  const documentsStage = join(root, "documents");
  await mkdir(documentsStage, { recursive: true });
  let position = 0;
  const seen = new Set<string>();
  let metadata: BackupMetadata | undefined;
  let documentFiles = 0;
  let documentBytes = 0;
  try {
    const magic = await readAt(file, position, ARCHIVE_MAGIC.length);
    position += ARCHIVE_MAGIC.length;
    if (!magic.equals(ARCHIVE_MAGIC))
      throw new Error("Backup payload is invalid");
    const count = (await readAt(file, position, 4)).readUInt32LE(0);
    position += 4;
    if (count < 2 || count > MAX_ENTRIES)
      throw new Error("Backup entry count is invalid");
    const archiveSize = (await file.stat()).size;
    for (let index = 0; index < count; index += 1) {
      const header = await readAt(file, position, 12);
      position += 12;
      const nameLength = header.readUInt32LE(0);
      const rawSize = header.readBigUInt64LE(4);
      if (
        nameLength === 0 ||
        nameLength > 4096 ||
        rawSize > BigInt(MAX_ENTRY_BYTES)
      )
        throw new Error("Backup entry is invalid");
      const size = Number(rawSize);
      const name = (await readAt(file, position, nameLength)).toString("utf8");
      position += nameLength;
      if (seen.has(name)) throw new Error("Backup contains a duplicate entry");
      seen.add(name);
      if (position + size > archiveSize)
        throw new Error("Backup entry is truncated");
      if (name === "metadata.json") {
        if (size > 1024 * 1024) throw new Error("Backup metadata is too large");
        const bytes = await readAt(file, position, size);
        try {
          metadata = JSON.parse(bytes.toString("utf8")) as BackupMetadata;
        } catch {
          throw new Error("Backup metadata cannot be read");
        }
      } else if (name === "database/estate.sqlite") {
        await copyRange(archivePath, databaseStage, position, size);
      } else if (validArchiveName(name) && name.startsWith("documents/")) {
        const relativeName = name.slice("documents/".length);
        const destination = resolve(documentsStage, relativeName);
        const documentsRoot = resolve(documentsStage);
        if (
          destination === documentsRoot ||
          !destination.startsWith(`${documentsRoot}/`)
        )
          throw new Error("Backup document path escapes storage");
        await copyRange(archivePath, destination, position, size);
        documentFiles += 1;
        documentBytes += size;
      } else {
        throw new Error("Backup contains an unknown entry");
      }
      position += size;
    }
    if (position !== archiveSize) throw new Error("Backup has trailing data");
  } finally {
    await file.close();
  }
  if (
    !metadata ||
    !seen.has("metadata.json") ||
    !seen.has("database/estate.sqlite")
  )
    throw new Error("Backup is missing required entries");
  if (
    metadata.formatVersion !== FORMAT_VERSION ||
    !Number.isSafeInteger(metadata.databaseBytes) ||
    !Number.isSafeInteger(metadata.documentFiles) ||
    !Number.isSafeInteger(metadata.documentBytes)
  )
    throw new Error("Backup metadata is invalid");
  const databaseDetails = await stat(databaseStage);
  if (databaseDetails.size !== metadata.databaseBytes)
    throw new Error("Database snapshot size does not match its metadata");
  if (
    documentFiles !== metadata.documentFiles ||
    documentBytes !== metadata.documentBytes
  )
    throw new Error("Document contents do not match backup metadata");
  return {
    root,
    databasePath: databaseStage,
    documentsPath: documentsStage,
    metadata,
  };
}

async function validateDatabase(path: string) {
  const sqlite = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = sqlite.pragma("integrity_check", { simple: true });
    if (integrity !== "ok")
      throw new Error("Restored database failed integrity check");
    const rows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const names = new Set(rows.map((row) => row.name));
    for (const table of REQUIRED_TABLES) {
      if (!names.has(table))
        throw new Error(`Restored database is missing ${table}`);
    }
  } finally {
    sqlite.close();
  }
}

async function renameIfPresent(from: string, to: string) {
  if (!existsSync(from)) return false;
  await rename(from, to);
  return true;
}

export async function restoreEncryptedBackup(
  inputPath: string,
  password: string,
  options: {
    databasePath?: string;
    documentsRoot?: string;
    closeDatabase?: () => void;
  } = {},
) {
  const passwordError = validateBackupPassword(password);
  if (passwordError) throw new Error(passwordError);
  const targetDatabase = options.databasePath || estateDatabasePath();
  const targetDocuments = options.documentsRoot || documentsPath();
  const root = await mkdtemp(join(tmpdir(), "estate-restore-"));
  const archivePath = join(root, "payload.archive");
  let staged: StagedRestore | undefined;
  try {
    await decryptPayload(inputPath, archivePath, password);
    staged = await parseArchive(archivePath, root);
    await validateDatabase(staged.databasePath);
    await mkdir(dirname(targetDatabase), { recursive: true });
    await mkdir(dirname(targetDocuments), { recursive: true });

    options.closeDatabase?.();
    const id = randomBytes(12).toString("hex");
    const oldDatabase = `${targetDatabase}.before-restore-${id}`;
    const oldWal = `${targetDatabase}-wal.before-restore-${id}`;
    const oldShm = `${targetDatabase}-shm.before-restore-${id}`;
    const oldDocuments = `${targetDocuments}.before-restore-${id}`;
    let movedDatabase = false;
    let movedWal = false;
    let movedShm = false;
    let movedDocuments = false;
    let installedDatabase = false;
    let installedDocuments = false;
    try {
      movedDatabase = await renameIfPresent(targetDatabase, oldDatabase);
      movedWal = await renameIfPresent(`${targetDatabase}-wal`, oldWal);
      movedShm = await renameIfPresent(`${targetDatabase}-shm`, oldShm);
      await rename(staged.databasePath, targetDatabase);
      installedDatabase = true;
      movedDocuments = await renameIfPresent(targetDocuments, oldDocuments);
      await rename(staged.documentsPath, targetDocuments);
      installedDocuments = true;
      await validateDatabase(targetDatabase);
      await rm(oldDatabase, { force: true });
      await rm(oldWal, { force: true });
      await rm(oldShm, { force: true });
      if (movedDocuments)
        await rm(oldDocuments, { recursive: true, force: true });
    } catch (error) {
      if (installedDocuments)
        await rm(targetDocuments, { recursive: true, force: true });
      if (movedDocuments) await rename(oldDocuments, targetDocuments);
      if (installedDatabase) await rm(targetDatabase, { force: true });
      if (movedShm) await rename(oldShm, `${targetDatabase}-shm`);
      if (movedWal) await rename(oldWal, `${targetDatabase}-wal`);
      if (movedDatabase) await rename(oldDatabase, targetDatabase);
      throw error;
    }
    return staged.metadata;
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(inputPath, { force: true });
  }
}

export async function inspectEncryptedBackup(path: string, password: string) {
  const passwordError = validateBackupPassword(password);
  if (passwordError) throw new Error(passwordError);
  const root = await mkdtemp(join(tmpdir(), "estate-inspect-"));
  const archivePath = join(root, "payload.archive");
  try {
    await decryptPayload(path, archivePath, password);
    const staged = await parseArchive(archivePath, root);
    return staged.metadata;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
