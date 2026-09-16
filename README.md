# Estate Organiser

> A calm, private web app to help two people navigate the logistics of settling a personal estate after the death of a parent.

## Status and purpose

**Core workflow in progress.** Organisations, interactions/quick notes, and tasks can now be created and edited, with SQLite persistence, multiple linked follow-ups, user attribution, readable revision history, and conflicting-edit protection. The overview shows saved tasks and the other user’s activity. The development preview saves fictional records in an isolated demo database. The feature sections below describe the agreed release scope, not a list of shipped functionality. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for delivery stages and acceptance criteria.

The goal is a polished release covering contacts, interactions, tasks, funeral arrangements, documents, and estate finances. Delivery will be staged, but these are all core requirements. This is a fresh start with no existing data to import; funeral arrangements and estate administration are both outstanding.

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

Target deployment: a single application Docker container on Unraid, with persistent SQLite and document storage in a mapped data volume. Cloudflare tunnel configuration is separate infrastructure.

- Create a consistent backup of both database and documents, encrypted before download.
- Initial workflow: manually download to the user's laptop, then copy to cloud storage.
- Keep the recovery password safely outside the app. Losing it can make the backup unrecoverable.
- Show when a backup was successfully created; do not claim that laptop/cloud copies succeeded without evidence.
- Supply restoration instructions and test a full restore before release.
- Scheduled transfer to a laptop is not part of the initial workflow.

Docker commands, environment variables, retention/storage limits, and operational details will be documented when implemented. A raw copy of a live SQLite file is not an adequate backup strategy.

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

Project grouping is available with three starter projects. Project editing, organisation-project links, recoverable deletion, document uploads, finances, checklist templates, backups, and install metadata are still upcoming; this is **not ready for real estate data or production use**.

### Browser workflow test

With a development preview running, and only fictional data in use:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser test creates clearly named fictional records in the running demo app. It exercises two separate browser sessions, conflict recovery, resolution warnings, task completion, persistence after reload, and quick capture at phone width. `E2E_BASE_URL` can point to another development preview; `CHROMIUM_EXECUTABLE_PATH` can select an already installed compatible Chromium. Never point this test at a real estate installation.

Run `npm run format:check` for source formatting checks.

Production dependency audit currently reports no vulnerabilities. The development-only Drizzle migration toolchain has four moderate audit findings through its older esbuild dependencies. These remain an explicit follow-up; do not expose its development tooling as a network service. Full Cloudflare/Unraid, browser accessibility, backup, and restore verification are still outstanding.

## Licence

Private / personal use. Not intended for public distribution at this time.
