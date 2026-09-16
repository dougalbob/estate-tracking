# Estate Organiser — Implementation Plan

The [README](../README.md) is the agreed product scope. These stages order implementation; they do not demote later core features to optional extras. Foundation implementation has started; persistent user-facing workflows are not yet implemented.

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

Remaining before Stage 2 is complete: project creation/renaming, organisation-project links, recoverable deletion and safe restore workflows. Documents, finances, templates, backups, deployment, installation metadata, full accessibility/security review, and live Cloudflare/Unraid validation remain later work. End-to-end tests add fictional example records and are intended only for the isolated demo preview.
