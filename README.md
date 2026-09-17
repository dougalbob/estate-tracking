# Estate Organiser

> A calm, private web app to help two people navigate the logistics of settling a personal estate after the death of a parent.

## Status and purpose

**Core workflow, checklist templates, production container packaging, and encrypted backup/restore are implemented.** Organisations, interactions/quick notes, and tasks can be created and edited, with SQLite persistence, multiple linked follow-ups, user attribution, readable revision history, and conflicting-edit protection. Projects can be created and renamed; organisations can belong to multiple projects while tasks have one optional project. Ordinary deletions go to a recoverable bin with restore and explicit permanent-deletion confirmation; deleting an organisation does not cascade-delete its notes or tasks. The overview shows saved tasks and the other user’s activity. The development preview saves fictional records in an isolated demo database. Documents, estate finances, and the three editable starter checklists are also implemented. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for delivery stages and acceptance criteria.

The goal is a polished release covering contacts, interactions, tasks, funeral arrangements, documents, and estate finances. Delivery is staged, but these are all core requirements. This is a fresh start with no existing data to import; fictional data remains the only permitted data until the production release verification is complete.

The app serves **one estate in England and exactly two equal users/beneficiaries**. Everything is shared. There is no public registration, additional role system, private-to-one-user data, or multi-estate support.

It runs on an Unraid server, accessed through Cloudflare Zero Trust with Google authentication. It organises user-entered facts and confirmed deadlines; it does not provide legal advice, calculate tax, determine debt priority, calculate inheritance entitlement, or recommend safe distributions.

## Design and navigation

Every screen should reduce cognitive load rather than create pressure.

- Default appearance: warm off-white surfaces, readable dark text, muted teal accents, generous spacing, restrained icons, and large mobile tap targets.
- Status is communicated with text as well as colour.
- No gamification, celebratory animations, or alarming overdue counters. Outstanding work must still be clearly visible.
- Responsive on desktop, tablets, and phones; installable where supported.
- **Online only:** no offline access or offline caching of private records or documents.
- Home prioritises due tasks, follow-ups, and approaching confirmed deadlines, followed by the other user's recent activity.
- Clear home-screen access to contacts, all tasks, and the document list.
- Global quick-note action available from every main screen.

### Theme-ready architecture

Adding themes later must not require restyling individual screens.

- Use central semantic design tokens for backgrounds, surfaces, text, borders, actions, focus indicators, and status colours, plus shared typography, spacing, and radius tokens.
- Components consume these tokens rather than hard-coded palette values, including charts and financial summaries.
- Define themes in a central registry and apply them at the app root using CSS variables.
- Ship one polished default theme initially. Additional themes, including dark mode, and a user-facing theme selector are future additions, not first-release requirements.
- Every theme must preserve readable contrast, visible focus, and non-colour status cues.

## Contacts and interactions

### Organisations

One record per organisation, with name, main contact name, phone number(s), email, account/reference details, and free-text notes. No separate people directory or multiple-account model is required.

Statuses: **Not Contacted → In Progress → Awaiting Response → Resolved**.

Status changes are manual and independent of tasks. Resolving an organisation with open tasks gives a warning; it does not close them. Organisations can link to multiple projects.

### Interaction history

Calls, emails, letters, and web forms can be logged against an organisation. Each interaction includes:

- Title and full detail.
- Interaction date/time, defaulting to now but editable for retrospective entries.
- Separate, automatically captured creation time and creating user.
- Optional attachments with friendly names.
- Zero or more follow-up tasks, each with an action, optional owner, and relevant dates.

For example: create Bank1 and its reference details, log a call, attach a document, and create linked tasks to send a certificate and chase a reply. Follow-ups appear in the normal task list and on the home screen when relevant.

### Quick capture

Quick notes accept an optional title and free-text detail, with automatic time and user attribution. Organisation and attachments are optional. Unlinked notes appear in an **Unfiled notes** list and can be linked or given follow-up tasks later.

## Tasks, dates, and projects

- Tasks may stand alone, optionally link to an organisation and source interaction, and have one optional project.
- Assign to either user or leave unassigned.
- States: **To do, In progress, Waiting, Done, Cancelled**.
- Distinguish a **due date** (action needed), **follow-up date** (check/chase), and **confirmed deadline** (a firm date entered by a user).
- Waiting tasks resurface on their follow-up date.
- No automatic calculation of legal deadlines.
- Reminders are in-app only; no email or browser/push notifications.

Starter projects are **Funeral**, **Notifications**, and **Probate & Estate Administration**. Users may rename them and create more, such as House Clearance. Contacts and documents may link to multiple projects; tasks and financial records have one optional project.

### Checklist templates

Provide editable, England-relevant starter checklists for the three starter projects. Users review and select tasks to add rather than receiving a large automatically populated workload. Do not assign dates automatically. Reapplying a template must avoid accidental duplicate tasks.

Templates may cover Tell Us Once, banks, post redirection, subscriptions, DVLA, funeral suppliers, and estate administration. They are organisational suggestions, not legal instructions or a guarantee of completeness.

Implemented so far: three lists, each written for this estate. The **Notifications** list (16 suggestions: a private pension rather than an employer scheme, no mortgage, gas and electricity with one supplier, broadband and mobile listed separately, and the registration appointment at the top), the **Probate & Estate Administration** list (21 suggestions for an English estate being handled without a solicitor), and the **Funeral** list (25 suggestions for a non-denominational cremation service led by a celebrant, with a wake at a local pub). Lists live in the database, so any line can be reworded, removed, or added to. Each project shows its list collapsed behind a "Starter checklist" summary; nothing is created until items are ticked and added, no dates or owners are set, and anything already in that project – including a task created from the same suggestion – is marked **Already added** and skipped on re-application. Removing a suggestion never touches tasks already created from it, and removed suggestions go to the recoverable bin. The probate list covers confirming whether a grant is needed, the will and who applies, valuing the estate and property at the date of death, balances and lifetime gifts, confirming with HMRC whether an Inheritance Tax account is needed, applying for the grant and signing the statement of truth, the fee and extra copies, registering the grant, paying debts, the property, estate accounts, income reporting, advertising for unknown creditors, distributions, and knowing when to get advice.

The funeral list covers registration and certificates, the separate cremation certificate, choosing a funeral director and agreeing the day, the celebrant and the tribute, the shape of the service, music, order of service, photographs, flowers or donations, what she will wear, transport, the wake venue and catering, telling people, a death notice, guests, dress, recording the costs in Estate finances, the day before, the ashes, and looking after each other afterwards.

Neither list quotes a threshold, rate, fee or figure: each line points at GOV.UK or HMRC to confirm the current position, and the app performs no tax calculation. Unit tests enforce this, and also check that the funeral wording assumes no religious service and no burial.

## Documents

- Store files locally, including PDFs, screenshots, and scanned documents.
- Upload independently or while recording an interaction.
- Give documents friendly names and categories.
- Store a document once and link it to multiple organisations, interactions, projects, or relevant financial records.
- Search by name, category, and associated records; no OCR or content search is required.
- Removing a link must not delete the underlying document or its other links.
- All document access requires the same authorisation as the rest of the app.

## Estate finances

**GBP only.** Record and summarise facts without tax or entitlement calculations.

- Categorised assets, estimated values, and eventual actual sale proceeds.
- Liabilities, outstanding amounts, and payments.
- Estate money received and paid out.
- Funeral and administration expenses personally paid by either user.
- Reimbursements owed and settled, including partial repayments.
- Distributions recorded against either beneficiary, without enforcing a 50/50 split.
- Financial records can link to organisations, projects, invoices, and receipts.
- Separate summaries for assets versus liabilities, cash movements, and personal amounts awaiting reimbursement.
- Reimbursement settles money owed to a user; it must not count the original expense again.
- Export asset/liability lists and financial records to CSV for spreadsheet use.

Implemented behaviour:

- Every amount is stored as an integer number of pence. Pounds are only an input and display format, so totals never drift.
- Five record types: **asset** (estimated value, then actual sale proceeds), **liability** (amount owed, then payments), **income**, **expense** (paid from the estate or personally by Alex or Jamie), and **distribution** (recorded against either beneficiary).
- Proceeds and payments are recorded as separate movements against the asset or liability, so the estimate stays alongside what actually happened.
- Reimbursements are movements against a personally paid expense. A GBP 500 expense with GBP 200 reimbursed leaves GBP 300 owed, and only one expense exists in the totals. Part payments are recorded as they happen; the app refuses a reimbursement that would exceed the amount owed, and refuses to reimburse an expense the estate paid directly. Liability payments have the same limit — correct the recorded amount first if it has changed.
- Corrections keep every previous version, its author and the time. **Voiding** (with a required reason) keeps a record visible, out of the totals, and can be reinstated. Financial records can be moved to the recoverable bin and restored, but they are **never permanently deleted** through the app: the server refuses, and the bin shows "Correct or void instead".
- Distributions are recorded as they happened, with no assumed 50/50 split.
- CSV downloads (assets and liabilities, cash movements, reimbursements owed) are generated on the server after the same authentication check. Text that a spreadsheet could treat as a formula is prefixed with an apostrophe and quoted; money is exported as plain decimals with money in and money out in separate columns, so nothing relies on negative numbers.
- No tax, debt-priority, or entitlement calculation appears anywhere in the summaries.

For fictional demo rows on the finances screens:
```bash
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-finances.ts
```
The script refuses to run against a database path that does not contain `demo`.

## Shared history, corrections, and recovery

- Chronological activity feed with automatic actor attribution.
- Edits retain previous versions, editor identity, and timestamps, with a discreet edited indicator and accessible history.
- Both users can edit shared records.
- Detect concurrent edits: never silently overwrite the other user's changes; preserve the unsaved draft for review.
- Ordinary deletions go into a recoverable bin with no automatic purge. Permanent deletion needs explicit confirmation.
- Deleting an organisation must not cascade-delete its interactions, documents, or finances.
- Financial corrections and voids retain a visible history; no permanent erasure through the normal interface.

## Authentication and privacy

There is no built-in login/password system. Cloudflare Access authenticates the two users through Google.

- Validate the Cloudflare Access JWT on the server: signature, expected issuer and audience, expiry, and membership in the configured two-user allowlist.
- Attribute actions using the verified identity, not an unverified email header or client-supplied actor.
- Restrict direct access to the origin so the tunnel is the intended entrance. Document downloads and all data operations remain protected independently of UI navigation.
- Missing or invalid authentication fails closed.
- An explicit development-only mock identity is permitted locally, but must be unavailable in production. Never silently fall back to a test user.

Primary database and document storage remain on Unraid. Remote traffic passes through Cloudflare, and Google participates in authentication; it would be inaccurate to claim all data always stays on the local network. User-managed encrypted backups also leave the server. No hosted database or analytics service is planned.

## Backups and deployment

The deployment package is now implemented for a single application Docker container on Unraid, with persistent SQLite and document storage in `/mnt/user/appdata/estate-organiser`. Cloudflare Tunnel and Cloudflare Access remain separate infrastructure. The container listens internally on port `3000`, while Unraid publishes host port `3005` to avoid a conflict on the server. It uses bridge networking and runs as root in v1 so that the first install is predictable; files created under the appdata mapping will therefore be owned by root.

**Safety gate:** the encrypted backup and restore stage is implemented and tested locally, but the production release verification is still outstanding. The app creates a consistent SQLite snapshot, includes the documents folder, encrypts the bundle with a user-managed recovery password, validates the authenticated backup before replacement, and keeps no server-side retention copy after download. A raw copy of a live SQLite file is not an adequate backup strategy because this app uses WAL mode.

### Backup and restore workflow

Open **Backup & restore** in the workspace. Why the password is entered in the form: it is used only for this operation, is never stored by the app, and is not placed in a URL or log. Why the file is versioned and authenticated: a wrong password, damaged file, or tampered archive must fail rather than produce a plausible partial restore.

- **Create encrypted backup:** enter a recovery password of at least 12 characters. The server uses SQLite's online backup API while holding a write lock, copies the database snapshot and every regular file below `/data/documents`, then encrypts a versioned bundle with scrypt-derived AES-256-GCM. The browser receives an `.estate-backup` download; Arena may still block the final save action, but the HTTP response and encrypted bytes can be tested independently.
- **Restore backup:** choose an `.estate-backup` file and enter the same recovery password. The server authenticates and decrypts the whole archive into staging, checks its metadata and SQLite integrity, then replaces the database and documents. A failed validation leaves the existing installation in place. Restoring is destructive, so the UI asks for confirmation first.
- **Retention:** the application deliberately retains no completed backup on Unraid. Keep dated copies on the user's own device/cloud storage, keep the password separately, and retain more than one known-good copy. Scheduled transfer is not part of this first workflow.
- **Restore testing:** local automated tests cover a fictional database, nested documents, wrong passwords, archive validation, and a clean restore. The release gate still requires one restore through the published image on a clean Unraid data volume before real records are entered.

### Deployment files

- `Dockerfile` is a multi-stage Node 22 image. The build stage installs `python3`, `make`, and `g++` so `better-sqlite3` can compile if a platform-specific prebuilt binary is unavailable; the runtime stage contains only production dependencies, the built Next.js app, migrations, and the plain-JavaScript migration runner.
- `docker-entrypoint.sh` loads `/data/estate.env` if present, runs migrations, and starts Next.js on the container's `0.0.0.0:3000`.
- `compose.yaml` is a portable reference using the same GHCR image, host port `3005` mapped to container port `3000`, and the `/mnt/user/appdata/estate-organiser:/data` mapping.
- `estate-organiser.xml` is the Unraid user-template import. It defines the `/data` mapping, host port `3005` to container port `3000`, bridge network, and WebUI link.
- `src/app/api/backup/` and `src/lib/backup/` provide authenticated encrypted download/restore with a versioned archive format; the workspace exposes it under **Backup & restore**.
- `.github/workflows/publish.yml` builds and publishes `ghcr.io/dougalbob/estate-organiser` on `v*` tags or manual dispatch. A version tag produces the version tag, `latest`, and a git-SHA tag.

### Unraid installation

These steps deliberately explain why each file is used. Do not put real credentials in Git, chat, or the Docker template.

1. **Create the persistent folder first.** The folder is the durable boundary for the database, documents, migrations' state, and the environment file; replacing the container must not replace the estate data.

   ```text
   /mnt/user/appdata/estate-organiser/
   ```

   Copy `.env.example` to `/mnt/user/appdata/estate-organiser/estate.env` using an Unraid terminal, an SMB share, or VS Code Remote. Fill in `CF_ACCESS_ISSUER`, `CF_ACCESS_AUDIENCE`, and exactly two addresses in `AUTH_USER_EMAILS`. Keep `DATABASE_PATH=/data/estate.sqlite` and `DOCUMENTS_PATH=/data/documents` unless there is a deliberate storage change. Set `DEV_AUTH_ENABLED=false`; it is ignored outside development and must never be used for an installation containing real records.

   Restrict the file to the administrator where practical, for example with `chmod 600 /mnt/user/appdata/estate-organiser/estate.env`. The container reads this file at startup because an Unraid template cannot pass Docker's `--env-file` option.

2. **Import the Unraid template.** Copy `estate-organiser.xml` into `/boot/config/plugins/dockerMan/templates-user/`, then open Docker → Add Container → User Templates → Estate Organiser. The template makes the image, bridge network, `/data` path, and host-port mapping (`3005` on Unraid → `3000` in the container) consistent rather than relying on manually re-entered values. Confirm that the host path is exactly `/mnt/user/appdata/estate-organiser`, the host port is `3005`, and the image is `ghcr.io/dougalbob/estate-organiser:latest`.

3. **Start and smoke-test the container.** On the first start, the entrypoint creates the configured directories, applies all pending Drizzle migrations, and only then starts the web server. Check the container log for `Database migrations complete.` and open this unauthenticated health URL from the Unraid LAN:

   ```text
   http://<unraid-lan-ip>:3005/api/health
   ```

   It should return HTTP 200 with `{"status":"ok"}`. The same endpoint is used by the compose healthcheck. A failed health check means the process or image is not ready; it does not bypass Cloudflare Access.

4. **Configure the existing Cloudflare Tunnel.** Add a public hostname such as `estate.<your-domain>` whose service is `http://<unraid-lan-ip>:3005`. The origin should remain a LAN address; do not point browser code at localhost and do not expose the Unraid port directly to the internet. The app's security headers include `private, no-store` caching, `nosniff`, and a restrictive referrer policy so documents and records are not browser/proxy-cached.

5. **Protect the hostname with Cloudflare Access.** Create a Self-hosted Access application for the hostname. Configure Google as the only enabled identity provider for this application (set up Google in Zero Trust → Settings → Authentication → Login methods if it is not already available). Add an Allow policy whose Include rule contains only the two real email addresses. Do not use a broad “everyone” rule. The application independently verifies the Access JWT issuer, audience, expiry, and email allowlist, so a spoofed email header is not sufficient.

6. **Complete the end-to-end check with fictional data.** Visit the public hostname, sign in with each allowed Google account, confirm that both can see the protected workspace, create a clearly fictional organisation and task, reload, and confirm persistence. Check `/api/health` from the LAN, upload a fictional document, create an encrypted backup, and confirm that an unauthenticated/private-window request to its document download URL fails. Delete the fictional rows afterwards. Do not begin real data entry until the published image has passed a clean restore exercise.

### Release and update flow

After review, merge the deployment change to `main`, then create and push a version tag such as `v0.2.0`. That tag triggers GitHub Actions to build the image and publish the version, `latest`, and SHA tags to GHCR. After the first publish, set the package visibility to **Public** in GitHub → Packages → `estate-organiser` → Package settings; Unraid is intentionally configured to pull anonymously and no registry credentials belong on the server. In Unraid, use Docker → the container's menu → Force Update to pull the new `latest` image. The persistent `/data` mapping keeps the database, documents, and `estate.env` across the replacement.

The workflow can also be started manually with `workflow_dispatch`, which publishes `latest` and the current SHA. The image cannot be built in the Arena sandbox because no Docker daemon is available; the first build is the GitHub Actions run.

## Installable PWA (Android)

The app ships a web app manifest (`src/app/manifest.ts`, served at `/manifest.webmanifest`), a no-op service worker (`public/sw.js`, registered from `src/app/layout.tsx`), and two PNG icons plus an Apple touch icon in `public/`. It is installable on Android Chrome as a standalone app. There is **no offline support** — the service worker only takes control so Chrome shows the install prompt; it performs no caching and adds no `fetch` handling, so every request still goes through Cloudflare Access.

### Installing

On Android Chrome, visit the site while signed in, open the browser menu, and choose **Install app** (or **Add to Home screen**). The app then opens on its own, in standalone mode, themed with the app's green/cream palette.

### Cloudflare Access changes required

Cloudflare Access sits in front of every path, including the static PWA assets. Chrome fetches the manifest and icons **before** sign-in when it evaluates installability, so those files must be reachable without an Access login. Add a **Bypass** policy (not Allow — Bypass means no authentication is required for these static assets) to the existing Access application, scoped to exactly these paths:

- `/manifest.webmanifest`
- `/sw.js`
- `/icon-192.png`
- `/icon-512.png`
- `/apple-touch-icon.png` (if present)

Every other path, including `/` and `/api/*`, stays behind the existing Access policy. The lockout screen in `src/app/page.tsx` means that even if someone hits `/` without auth, they get the “Protected workspace” page with no data — there is **no separate public landing page**, and this is intentional. Adding the Bypass rules above only exposes the app name and icons, nothing else.

> Important: on Unraid you must **Force Update** to pull the new image after a release. And the Cloudflare Access Bypass policy must be added **before** users can install the PWA on Android — otherwise the install banner will not appear, because the manifest cannot be fetched pre-auth.

## Proposed technology

| Layer | Direction |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| ORM | Drizzle |
| Database | SQLite (`better-sqlite3`) |
| Styling | Tailwind CSS with semantic CSS-variable theme tokens |
| UI components | shadcn/ui |
| Mobile installation | Web app manifest; no sensitive offline caching |
| Authentication | Server-verified Cloudflare Access JWTs |
| Deployment | Docker on Unraid |

The original proposal specified Next.js 15 and a PWA plugin. Before scaffolding, check current supported, patched framework versions and dependency compatibility. Offline support is no longer a requirement, so a caching plugin is not assumed necessary.

## Development

Requires Node.js 22 or newer.

```bash
npm ci
DATABASE_PATH=./data/demo.sqlite npm run db:migrate
# Fictional data only; never use this mode for real estate information
DEV_AUTH_ENABLED=true NEXT_TELEMETRY_DISABLED=1 npm run dev
```

Demo mode always uses `./data/demo.sqlite`, regardless of `DATABASE_PATH`, so fictional records do not mix with the production database. The “Try as Alex/Jamie” control is development-only and lets you test attribution and the activity feed; it is unavailable in production.

The development server binds to `0.0.0.0:3000` and allows Arena preview hosts. Do not expose development mode as a real estate installation. `.env.example` documents the production identity settings; configure those through your deployment environment. Database CLI commands read exported environment variables (they do not load `.env.local` themselves).

```bash
npm test
npm run typecheck
NEXT_TELEMETRY_DISABLED=1 npm run build
npm run db:migrate # Apply migrations to DATABASE_PATH, or ./data/estate.sqlite
NEXT_TELEMETRY_DISABLED=1 npm start
```

Without valid Cloudflare configuration/authentication, the production page shows a protected-workspace message and no records. Every save action independently enforces the server-side identity guard and validates its input. Record changes and revision entries are committed together; an interaction and all of its new follow-ups are one transaction. Task dates are date-only values, while interaction/audit instants are stored in UTC and displayed in Europe/London. The interaction form accepts the device’s local date/time.

Project grouping, renaming, organisation-to-project links, and the recoverable bin (soft delete, restore, and explicit permanent deletion with retained history) are now available alongside the three starter projects. Document uploads with reusable links, estate finances in GBP as integer pence with CSV exports, the three editable starter checklists, and encrypted backup/restore are also implemented. Docker/Unraid deployment packaging is now present, while the first published-image restore exercise, install metadata, and a full accessibility/security review remain before the app is used for real estate data.

### Browser workflow test

With a development preview running, and only fictional data in use:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser test creates clearly named fictional records in the running demo app. It exercises two separate browser sessions, conflict recovery, resolution warnings, task completion, persistence after reload, and quick capture at phone width. `E2E_BASE_URL` can point to another development preview; `CHROMIUM_EXECUTABLE_PATH` can select an already installed compatible Chromium. Never point this test at a real estate installation.

Run `npm run format:check` for source formatting checks. The unit suite (50 tests) covers shared records, documents, checklist templates, finances, and encrypted backup/restore, including the GBP 500/200/300 reimbursement case, part payments, voids, CSV formula protection, document inclusion, clean restore, and wrong-password failure.

Production dependency audit currently reports no vulnerabilities. The development-only Drizzle migration toolchain has four moderate audit findings through its older esbuild dependencies. These remain an explicit follow-up; do not expose its development tooling as a network service. Published-image Unraid/Cloudflare, browser accessibility, and clean production restore verification remain outstanding.

## Licence

Private / personal use. Not intended for public distribution at this time.
