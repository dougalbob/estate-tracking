# Estate Organiser — Implementation Plan

The [README](../README.md) is the agreed product scope. These stages order implementation; they do not demote later core features to optional extras. The core contact → interaction → follow-up workflow, project creation/renaming, organisation-to-project links, and recoverable deletion with safe restore have been implemented and unit-tested. The application is still in development, not ready for real estate information or production use.

## Start here — conversation handover (16 September 2026)

### User feedback and working style

- The user has tried the core workflow and confirmed that it works.
- The user explicitly approves the current layout, logical navigation, and calm default theme. Preserve these rather than redesigning the app.
- The user is new to agent-assisted development. Explain milestones, testing, previews, commits, PRs, and merges in plain English. Clearly distinguish completed work from planned features.
- Product decisions in the README are agreed. Do not restart the requirements questionnaire unless a genuinely new decision is needed.

### Progress at a glance

| Stage | Status | Remaining work |
|---|---|---|
| 1. Foundation | Implemented baseline | Full accessibility/security review, additional-theme coverage, and real Cloudflare/Unraid verification remain |
| 2. Shared records | Implemented – core workflow, projects, and recoverable bin | Full browser e2e coverage for new bin/project flows in restricted sandbox, accessibility polish |
| 3. Documents | Not implemented | Uploads, reusable links, friendly names, metadata search, protected downloads |
| 4. Finances | Not implemented | Inventory, transactions, reimbursements, distributions, summaries, exports |
| 5. Dashboard/mobile/templates | Partly implemented | Dashboard, filters, quick capture and responsive screens exist; templates, install metadata and complete accessibility polish remain |
| 6. Backups/deployment | Not implemented | Encrypted coordinated backup, restore tests, Docker/Unraid deployment and operational documentation |

### Next recommended work

Stage 2 is now complete. Continue to Stage 3 before finances:

1. Implement locally stored documents with friendly names and reusable links – upload independently or while recording an interaction, store once and link to many records, search by name/category/associated records, protect downloads.
2. Define safe filename handling, size limits, and file-metadata lifecycle for bin/restore and permanent deletion.
3. Extend automated and browser tests, then ask the user to try document workflows.
4. Continue to Stage 4: estate finances in GBP with reimbursement and export handling.

### Where to find the current implementation

- `src/components/workspace.tsx`: navigation, overview, contacts, task lists, notes, projects, recoverable bin, history and demo-user switch, plus delete/restore handling.
- `src/components/record-form.tsx`: organisation (now with multi-project checkboxes), interaction, task, and project forms, follow-ups, conflict/draft recovery.
- `src/components/record-summary.tsx`: readable history and comparison fields, now aware of deleted records and project links.
- `src/app/actions.ts`: authenticated server actions for save, soft-delete, restore, and permanent delete.
- `src/lib/records/store.ts`: transactional writes, organisation-project join handling, revision history, optimistic version checks, resolution warnings, recoverable bin with no auto-purge, safe restore checks, and non-cascading permanent deletion that retains revision metadata.
- `src/lib/records/validation.ts`: input schemas for organisations (with projectIds), tasks, interactions, and projects.
- `src/lib/db/schema.ts` and `drizzle/`: schema and versioned migrations including `organisation_projects` and `deleted_at` columns. Add migrations; do not replace the existing history.
- `src/lib/auth/`: Cloudflare verification and explicit development identity. Never introduce a production fallback.
- `src/app/globals.css` and `src/themes/index.ts`: approved calm theme and token foundation; new minimal styles for project pills and bin actions reuse existing tokens.
- `tests/`: 22 unit/integration tests covering Bank1 flow, project creation/renaming, organisation-project links, bin soft-delete/restore, permanent deletion, non-cascade behaviour, and London DST date handling, plus the two-user browser workflow.

### Restarting and checking the app

Do not assume the previous conversation's live server, dependencies, browser installation, or fictional database survived into the next workspace. Check the environment first.

```bash
npm ci
DATABASE_PATH=./data/demo.sqlite npm run db:migrate
DEV_AUTH_ENABLED=true NEXT_TELEMETRY_DISABLED=1 npm run dev -- --port 3000
```

Use the agent's long-running process tool for the development server. It binds to `0.0.0.0`; the configuration permits Arena preview hosts. Use fictional information only. Demo mode always uses `data/demo.sqlite`, separate from the production database. The development-only Alex/Jamie switch lets the user try attribution and shared activity. There is no required example-data seed; a new demo database starts empty except for starter projects.

```bash
npm test
npm run typecheck
npm run format:check
NEXT_TELEMETRY_DISABLED=1 npm run build
npm audit --omit=dev
# With the demo server running and a compatible Chromium installed:
npm run test:e2e
```

At the last implementation checkpoint, 16 unit/integration tests, the two-user Chromium workflow, TypeScript, formatting and the production build passed. Production dependency audit reported zero findings; four moderate development-only Drizzle/esbuild findings remained. These are historical results: rerun relevant checks after changes. Browser downloads were blocked in the previous sandbox, so a locally extracted Chromium was used; do not assume its temporary executable exists in a new session. Browser tests create fictional records in the demo app.

### GitHub handover

- Repository: `dougalbob/estate-tracking`.
- Current draft PR: [#1 — Build Estate Organiser](https://github.com/dougalbob/estate-tracking/pull/1).
- The core-workflow implementation was published as commit `0d7332c` on `arena/01a0a93b-estate-tracking`.
- `main` has not been updated. Keep the PR in draft and do not merge as part of this handover.
- At the start of a new Arena session, inspect `git status`, branch history and the PR. Follow the branch assigned to that session; do not assume a new conversation automatically resumes the same branch or live preview.
- The user prefers milestone commits/pushes, testing throughout, and a reviewed merge when the agreed release is ready. Explain any branch/PR difference before publishing subsequent work.

## 1. Foundation, identity, and themed shell

- Select supported, patched dependency versions; scaffold Next.js, TypeScript, Drizzle, SQLite, Tailwind, and shadcn/ui.
- Establish migrations, database transactions, server-side validation, and test tooling.
- Define the two-user configuration and verify Cloudflare JWTs server-side. Guard every data endpoint and document route.
- Isolate explicit development identity support; reject that configuration in production.
- Build responsive navigation, home layout, global quick-note entry, and shared form/error/loading/empty states.
- Implement semantic theme tokens and a central theme registry; ship only the agreed default theme.

**Acceptance:** invalid, expired, wrong-audience, and unauthorised identities cannot access data; email-header spoofing fails. Production cannot use mock identity. Layout works by keyboard and at phone/desktop sizes. A temporary test palette can change the shell and components without per-screen changes.

## 2. Shared records and audit foundations

- Model organisations, interactions/quick notes, projects, tasks, and their links.
- Record immutable creation attribution and separate interaction dates.
- Build organisation lists/details and interaction entry with multiple follow-up tasks.
- Add standalone tasks, assignment, statuses, and distinct date semantics.
- Seed starter projects, not a compulsory task workload.
- Implement record version checks, revision history, activity events, recoverable deletion, and safe relationship handling.

**Acceptance:** the agreed Bank1 call flow works end to end. Either user can see attribution and revisions. Concurrent editing preserves the losing draft rather than overwriting data. Organisation resolution warns about open tasks. Deletion does not cascade into linked records.

## 3. Document storage and linking

- Implement authenticated uploads/downloads with safe generated storage names, friendly display names, categories, and metadata search.
- Validate allowed formats and sizes; prevent path traversal and unsafe inline active content.
- Support one stored document linked to many records, including unfiled notes.
- Coordinate database metadata with file lifecycle, including failed uploads, bin/restoration, and permanent deletion.

**Acceptance:** one uploaded certificate can be reused across interactions. Removing one link leaves other links intact. Unauthenticated downloads fail. Unsafe filenames cannot escape storage. File failures leave recoverable, understandable state.

## 4. Estate finances and exports

- Model assets, liabilities, income, expenses, personal funding, reimbursements, and distributions.
- Store GBP amounts as integer pence, not floating-point currency.
- Define explicit links between valuations, realisations, payments, and reimbursements to avoid duplicate totals.
- Build separate value, cash-movement, and outstanding-reimbursement summaries.
- Retain financial correction/void history; link receipts and relevant contacts/projects.
- Add CSV exports with spreadsheet formula-injection protection.

**Acceptance:** tests cover partial reimbursements, liability part-payments, asset sale proceeds versus estimated value, corrections, and distributions. A £500 personal expense with £200 reimbursed leaves £300 owed without creating a second expense. No tax, debt-priority, or entitlement calculations appear.

## 5. Attention dashboard, templates, and mobile polish

- Populate home with actionable dates, waiting follow-ups, and the other user's recent activity.
- Provide contacts, all-tasks, and document-list shortcuts plus an unfiled-notes view.
- Add previewable/editable templates with selective insertion and duplicate prevention.
- Add install metadata without private offline caches.
- Review typography, contrast, focus, tap targets, responsive tables, and calm wording across all screens.

**Acceptance:** completed/cancelled work does not remain in actionable queues. Date handling is tested around Europe/London daylight-saving changes. Template reuse does not accidentally duplicate tasks. Offline use does not expose a service-worker copy of private records.

## 6. Backups, deployment, and release verification

- Implement consistent database-and-document backup creation using a maintained authenticated-encryption approach; do not invent cryptography.
- Define a versioned archive format and clear failure reporting. Prevent mismatched database/file snapshots during concurrent writes or deletions.
- Support manual encrypted download and report last successful creation accurately.
- Package the application for Unraid with persistent storage, migrations, health checks, and restricted-origin deployment guidance.
- Write configuration, backup, password-recovery limitations, restore, and upgrade instructions.
- Restore a backup into a clean installation and verify records, attachments, links, financial totals, and audit history.

**Acceptance:** incorrect passwords and corrupted archives fail safely. Interrupted backups are not marked successful. An independently restored installation passes the core workflow tests. Restarting/upgrading the container preserves data. No private records or credentials appear in operational logs.

## Proposed modelling boundaries

- Exactly two configured users; one estate, no tenant system.
- One organisation entity, no separate person directory or bank-account subsystem.
- Interactions and quick notes share a record model with optional organisation linkage.
- Follow-ups are tasks linked to their source interaction, not embedded reminder text.
- Tasks and finances have one optional project; organisations and documents support multiple projects.
- Documents have independent identities and link records; attachment duplication is not the normal workflow.
- Revision and activity records capture server-verified actors. Financial voids/corrections remain traceable.

These are implementation directions, not a final database schema. Validate them against the agreed workflows before migrations are established.

## Remaining technical choices and working assumptions

No further product questionnaire is required before starting. Resolve technical details during design and document them explicitly:

- **Backup workflow:** manual download and user-managed cloud copy initially; scheduled laptop transfer is future scope. Archive limits, local retention, encryption library, and password handling need implementation design.
- **Dates:** propose date-only task dates interpreted in Europe/London; store interaction/audit instants in UTC and display locally.
- **Uploads:** supported formats, size limits, and available server storage need documented configuration.
- **Deletion:** define which identifying metadata remains in history after ordinary permanent deletion; never describe the recoverable bin as erasing backup copies.
- **Financial detail:** confirm precise field labels and reconciliation behaviour with sample transactions before building summaries.
- **Themes:** extensible token system and one default theme now; no theme editor, additional palette, or preference selector promised for the first release.

## Release gate

All six stages are required for the polished initial release. Run unit/integration tests, critical two-user end-to-end workflows, accessibility checks, authentication bypass checks, production container smoke tests, and a clean restore exercise. Record actual results and outstanding limitations; do not describe planned features as shipped.

## Earlier foundation checkpoint — 16 September 2026

Implemented: Next.js 16.3.5/React shell, semantic default-theme tokens and registry, responsive fictional overview, explicit development identity, JWT verification and two-user allowlist, initial organisation migration, and database connection foundation.

Verified: eight automated authentication/database tests; TypeScript check; production build; HTTP checks for fictional preview rendering and a protected production page despite a spoofed email header. Migration applied successfully and repeat-application tested in memory. Production dependency audit: zero findings. Development tooling: four moderate findings in the Drizzle/esbuild chain remain unresolved.

Not yet verified: full browser/accessibility review, live Cloudflare identity exchange, Unraid deployment, and additional-theme coverage. At that checkpoint, there were no record-write endpoints or functional task/note forms. That limitation is superseded by the core-workflow checkpoint below. Live deployment and complete accessibility verification remain outstanding.


## Core-workflow checkpoint — 16 September 2026

Implemented:
- Organisation creation/editing, search, contact/reference details, and manual status changes.
- Calls, emails, letters, web forms, and unfiled quick notes, including retrospective interaction time and immutable original attribution.
- Multiple new follow-up tasks saved atomically with an interaction, plus standalone tasks and later follow-ups.
- Two-user assignment or unassigned tasks, optional starter-project grouping, task states and three distinct date fields.
- Saved-task overview, task search/status/owner filters, and other-user activity. Visible, idle screens refresh periodically and on window focus; editing drafts are not refreshed automatically.
- Revision history with readable before/after fields and compare-and-save version checks. Conflict recovery keeps the draft, displays the latest record, and requires explicit review before another save.
- Explicit warning/confirmation before resolving an organisation with open tasks; tasks remain unchanged.
- Authenticated, validated server actions; development data isolated in `data/demo.sqlite`, with a development-only Alex/Jamie switch.

Verified: 16 unit/integration tests; production build; TypeScript and formatting checks; Chromium end-to-end test using two independent user sessions, persistence across reload, revision history, conflict recovery, resolution warnings, task completion, and mobile quick capture without horizontal overflow. Standard browser download was blocked by the sandbox network; the browser run used a locally extracted Chromium instead. Generated browser binaries/screenshots and demo records are not tracked in Git.

Remaining before Stage 2 is complete: ~~project creation/renaming, organisation-project links, recoverable deletion and safe restore workflows~~ – now implemented. Documents, finances, templates, backups, deployment, installation metadata, full accessibility/security review, and live Cloudflare/Unraid validation remain later work. End-to-end tests add fictional example records and are intended only for the isolated demo preview.

## Project management and recoverable bin checkpoint — 16 September 2026

Implemented:
- Project creation and renaming with case-insensitive duplicate prevention, versioned edits, and audit history. Starter projects (Funeral, Notifications, Probate & Estate Administration) backfilled with version/timestamps.
- Organisation-to-project links via `organisation_projects` join table; organisations can belong to multiple projects, tasks to one optional project. Organisation form now shows project checkboxes; project view shows linked organisations and tasks.
- Recoverable bin with no automatic purge: soft-delete for organisations, interactions, tasks, and projects moves records to bin; restore validates linked records and checks for name conflicts; permanent deletion requires prior bin move and explicit typed confirmation (`DELETE`), retains revision history, and unlinks rather than cascade-deletes notes/tasks/documents.
- Safe relationship handling: deleting an organisation leaves its interactions and tasks intact (organisationId cleared only on permanent deletion); deleting a project unlinks tasks and organisation links but does not delete them; deleting an interaction unlinks its follow-up tasks.
- UI: new “Recoverable bin” navigation with count, restore and permanent-delete actions, history entries for deleted/restored/permanently_deleted, project pills with edit affordance, and bin buttons on task rows, note cards, and organisation details. Approved calm theme preserved.
- Validation: project name required, max 200 chars; organisation projectIds validated against active projects; delete/restore check version and deletedAt state.

Verified:
- 22 unit/integration tests (previously 16) – all passing, including new tests for project lifecycle, multi-project links, bin soft-delete/restore, permanent deletion retaining history, non-cascade behaviour, and restore failure when dependencies are in bin.
- TypeScript check passing, production build passing, Prettier formatting passing.
- Development preview manually checked: navigation includes bin, project creation/renaming works, organisation linking works, bin shows deleted items, restore works, permanent deletion requires confirmation.
- Browser e2e workflow not rerun in this sandbox due to blocked Chromium download (same network restriction as previous checkpoint); existing workflow still exercises core Bank1 flow. The new bin/project flows are covered by unit/integration tests and manual preview checks.

Remaining before Stage 3: document uploads with friendly names and reusable links, protected downloads, file lifecycle with bin/restore. Finances, templates, backups, deployment, install metadata, full accessibility/security review, and live Cloudflare/Unraid validation remain later work. End-to-end tests add fictional example records and are intended only for the isolated demo preview.
