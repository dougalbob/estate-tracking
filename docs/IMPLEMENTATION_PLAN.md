# Estate Organiser — Implementation Plan

## Current state — 18 September 2026

Read this before the dated sections below. They are kept as a record, and some of them describe work that has since shipped.

| Item                   | Position today                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live release           | **v0.2.9** (a map link typed in by hand on each contact, a Notes label on the contact screen, and the Event log's kind icons on interaction cards), built by GitHub Actions and published to GHCR; v0.2.0–v0.2.8 preceded it on 16–18 September 2026, and v0.2.8 is what the server runs until the image is pulled     |
| Build source of truth  | `.github/workflows/publish.yml`, triggered by pushing a `v*` tag. Only a tag publishes an image                                                                                                                                                                                                                        |
| Data in use            | **Real estate records and real documents.** The installation is live on Unraid behind Cloudflare Access, and both users work in it                                                                                                                                                                                     |
| Verified in production | Both users signing in; document upload; **an encrypted backup created and restored, with the records confirmed afterwards**; the PWA installed on Android with the Cloudflare Access Bypass rules in place; the v0.2.6 contact popup used on a PC and a mobile phone against the live installation (17 September 2026) |
| Automated gates        | **89 unit/integration tests**, `tsc --noEmit`, `prettier --check` and `next build` all pass on the released commit                                                                                                                                                                                                     |
| Still outstanding      | A full accessibility and security review; four moderate audit findings in the development-only Drizzle/esbuild toolchain. There is deliberately no offline support                                                                                                                                                     |
| Version numbering      | The next release after v0.2.10 is v0.2.11. Tags are the version source of truth; `package.json` is kept in step for tidiness                                                                                                                                                                                           |

### Sandbox facts a new session must know

- **No Docker daemon here.** The container image cannot be built in the Arena sandbox; only GitHub Actions builds and publishes it.
- **`npm ci` fails on `better-sqlite3`** because node-gyp tries to compile and the node headers are blocked. Use **`npm ci --ignore-scripts`**: `better-sqlite3` ships prebuilt binaries in its npm tarball, so the unit suite still runs normally.
- **Nothing local persists between sessions.** The workspace is re-cloned from GitHub each time; `node_modules`, `.next` and caches are not kept. Only pushed commits survive.
- **Do not assume a browser is available.** `npm run test:e2e` needs a Chromium that the sandbox cannot download, so plan on unit tests, the type check, the production build and a dev-server smoke test unless a browser is known to be installed.
- **Session branches are per-session.** Work on whatever branch the current Arena session created, normally `arena/<session-id>-estate-tracking`. Never reuse or switch to a branch name copied from an older session or from an older copy of this document.
- **The workspace can be reset to `main` between turns, mid-session**, wiping local commits, `node_modules` and `data/demo.sqlite`, while uncommitted working files survive. Recovery that works, and loses nothing: `git fetch origin <session-branch> && git reset --mixed FETCH_HEAD`, then `npm ci --ignore-scripts`, then re-run the demo migration and seeds. **Push early and often** — only pushed commits survive reliably.
- **There is no browser**, so UI changes are verified by rendering the real components to static markup with `tsx` against the demo database, plus `curl` against the development server. The harness lives outside the repository and is deleted afterwards: stub `@/app/actions` and `next/navigation`, point a temporary tsconfig at the stubs, and assert on presence _and_ absence (see the v0.2.5 and v0.2.6 checkpoints).

### Documentation rule — update both documents before every merge

The user asked for this explicitly after a session inherited documents that described test counts, shipped features and outstanding work inaccurately. Document rot is treated as a defect, not as tidying up.

1. **Before merging anything**, check `README.md` and this plan against what the change actually does, and correct them **in the same pull request**. Merging first and documenting later is what caused the problem.
2. If behaviour the user can see has changed, both documents are updated: the README (what the app does, for the user) and this plan (what was built, when, and what is still outstanding).
3. A change with no visible behaviour difference — a refactor, a test-only edit, a dependency bump — needs no wording change, but the pull request says so in one line. Silence is not the same as "nothing to update".
4. **Move things between "outstanding" and "done"**: never leave a completed item listed as remaining, and never describe planned work as shipped. This is exactly what went wrong in the v0.2.0–v0.2.4 notes.
5. Counts, versions and file names in the documents must be **re-derived at merge time**, not copied forward: how many tests, the current tag, the actual paths.
6. When a release is tagged, the current-state table at the top of each document is updated as part of the same release work.

### Release lessons (expensive to rediscover)

1. **In Next 16, `serverActions` must be nested inside `experimental` in `next.config.ts`.** A top-level `serverActions` key is silently ignored and fails the production type check with `TS2353`, which breaks the image build rather than the dev server. The correct form is `experimental: { serverActions: { bodySizeLimit: "25mb" } }`. A comment in `next.config.ts` records this so it is not re-broken.
2. **A failed publish is safe but must be recovered deliberately.** If the workflow fails, no image is pushed and `latest` does not move, so the running installation is unaffected — nothing is broken, nothing is released either. Fix the cause on the session branch, merge to `main`, then re-point the same tag at the new merge commit (`git tag -f -a vX.Y.Z -m "<same message>" origin/main` and `git push -f origin vX.Y.Z`). That is safe _only_ while no image exists for the failed tag. Confirm success with `gh run watch`, then verify the tags exist on the package with `gh api "/users/dougalbob/packages/container/estate-organiser/versions?per_page=3" --jq '.[] | "\(.metadata.container.tags|join(","))  created:\(.created_at)"'`.
3. **A green local build is not a green image.** v0.2.3 failed to serve the PWA because the Dockerfile did not copy `public/` into the runtime stage while the local build was fine. Check the Dockerfile when adding files that the runtime serves directly.

## Start here — conversation handover (16 September 2026)

> The user-feedback notes below still hold. The progress table and the work list immediately after them are the position as at 16 September; where they say something is "remaining", compare with the current state above, which supersedes them.

The [README](../README.md) is the agreed product scope. These stages order implementation; they do not demote later core features to optional extras. The core contact → interaction → follow-up workflow, project creation/renaming, organisation-to-project links, recoverable deletion with safe restore, document storage with reusable links, estate finances in GBP, all three editable checklist templates, the Docker/Unraid deployment package, and encrypted backup/restore are all implemented, unit-tested where applicable, and released. Published-image release verification was completed on 17 September 2026, and the installation now holds real estate information.

### User feedback and working style

- The user has tried the core workflow and confirmed that it works.
- The user explicitly approves the current layout, logical navigation, and calm default theme. Preserve these rather than redesigning the app.
- The user is new to agent-assisted development. Explain milestones, testing, previews, commits, PRs, and merges in plain English. Clearly distinguish completed work from planned features.
- Product decisions in the README are agreed. Do not restart the requirements questionnaire unless a genuinely new decision is needed.
- Production document storage agreed as `/mnt/user/appdata/estate-organiser/documents` (container `/data/documents` via Docker volume). Demo mode isolates to `./data/demo-documents` so fictional files never mix with real ones.

### Progress at a glance (as at 16 September 2026 — see Current state above)

| Stage                         | Status                                                                                                                                                               | Position on 18 September 2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation                 | Implemented baseline                                                                                                                                                 | Real Cloudflare/Unraid verification is done and both users sign in. Accessibility/security review and additional-theme coverage remain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2. Shared records             | Implemented – core workflow, projects, and recoverable bin                                                                                                           | v0.2.8 added the Event log tab over every interaction and one optional project on an interaction; v0.2.9 added a hand-typed map link on each contact, a Notes label on the contact screen and the Event log's kind icons on interaction cards; v0.2.10 added a sort menu and a Hide resolved filter to the contacts list, a type, a Task Outcome and a Create interaction button on the task, an Everyone assignee for work the two users share, and renamed the Waiting status to Scheduled in a data migration (`0008_task_type_outcome_and_scheduled`); browser e2e still needs a machine with a browser, so bin/project flows are covered by unit tests and manual use |
| 3. Documents                  | Implemented – upload, reusable links, viewer, protected downloads, bin handling, decluttered UX                                                                      | Upload is verified in production (v0.2.4 raised the body limit and added the streaming route); browser e2e still unavailable in the sandbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4. Finances                   | Implemented – assets, liabilities, income, expenses, personal funding, reimbursements, distributions, three summaries, CSV exports, void/correction history          | Unchanged; no further feedback from the user's first pass yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5a. Checklist templates       | Implemented for the three starter projects – Notifications (16), Probate & Estate Administration (21) and Funeral (25), all editable with duplicate-safe application | Unchanged; any wording changes the user wants are still welcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 5. Dashboard/mobile/templates | Implemented                                                                                                                                                          | Dashboard, filters, quick capture, responsive screens, all three checklist lists and the installable PWA are in place and the app is installed on Android. Accessibility polish remains                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6. Backups/deployment         | Deployment package and encrypted backup/restore implemented, released and verified                                                                                   | The GitHub Actions build ran first at v0.2.0 and on every release since; the live Unraid/Cloudflare check and a restore through the published image were completed on 17 September 2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### What was recommended next on 16 September — all four items completed

Kept as a record. Each item below was actioned; the outcome is stated so a future session does not repeat it.

1. Run the local gates and review the backup format, restore warnings, Dockerfile, entrypoint, compose reference, Unraid template and health route — **done**; the gates run on every release.
2. Merge to `main`, create a version tag, make the GHCR package public and perform the end-to-end check — **done**; v0.2.0 shipped on 16 September and v0.2.1–v0.2.5 followed, with the package public and the checks completed.
3. Restore a backup through the published image and verify records, documents, links, totals and history before real data entry — **done on 17 September 2026** on the live installation, with the records confirmed afterwards.
4. Add PWA install metadata and run the accessibility/security pass — **the PWA is done and installed on the user's phone**; the accessibility/security pass is the one item still outstanding.

### Where to find the current implementation

- `src/components/workspace.tsx`: navigation, overview, contacts, task lists, notes, projects, documents (decluttered row: friendlyName + category·linkedNames + Uploaded on date by user), recoverable bin, history and demo-user switch, plus delete/restore handling, in-app document viewer dialog, multi-method download fallback (anchor+download, hidden iframe, fetch blob+object URL, direct link) to handle Arena preview sandbox `allow-popups` restriction. v0.2.5 added `TaskLinkPicker`, the dialog behind **Link existing task** on a contact: it lists only tasks with no contact, filters by the note's organisation where a task came from a note, searches by title and detail, and sends only `{ taskId, organisationId, version }`. v0.2.6 added `ContactQuickViewDialog`, the popup behind the contact name on a task row: it reads the organisation out of the snapshot already in the browser (no action, no request), lists Main contact / Phone numbers / Email / Account / reference in the contact screen's order with “Not added” for an empty field, dials via `tel:` and copies via `navigator.clipboard`, and offers **Open full contact**. `Workspace` holds only the organisation **id** in `contactQuickView`, so the popup follows edits and disappears if the contact is binned; `taskRow` renders the name as a `.task-org` button only when `liveOrganisation()` finds a live record, which is what keeps a binned contact's name — and “No organisation” — plain text. v0.2.7 made `documentRow` build its link line from `documentLinkItems` — each directly linked live contact is its own `.task-org` button, a note or task by title, a project by name and a binned contact by name are plain text — and gave `ContactQuickViewDialog` a `closeLabel` so its close button reads **Back to documents** when the popup is opened from the Documents tab. The contact screen's plain field list was replaced by the shared `ContactFieldList` (Main contact / Phone numbers / Email / Account / reference, `tel:` dial links with a copy button each, “Not added”, and the copy-state line), which `ContactQuickViewDialog` now renders too, so the popup and the contact screen cannot drift apart. The contact list rows were deliberately left exactly as they are: one button that opens the contact, with no nested link or control. v0.2.8 added the `events` view between Documents and Unfiled notes: `filteredEvents` (word-split title/detail search, Organisation/Project/Type/Recorded by dropdowns and an order toggle (newest- or oldest-first)) rendered by `eventRow` (kind icon plus a text badge, tappable contact via `liveOrganisation`, project name or “No project”, Europe/London time, recorder, Edit/History/Bin), a **Reset filters** button disabled at the defaults, and a `closeLabel` of **Back to the event log** when the popup opens from an event row. v0.2.9 gave `ContactFieldList` a fifth row — the map link as a tappable **Open map** (`target="_blank"`, `rel="noreferrer"`) with the standard copy button and “Not added” when empty — and removed the field list's idle help line, keeping only the two transient copy messages, so an untouched popup or contact screen shows nothing where the line was; the contact screen's notes now sit under a **Notes** heading shown only when notes exist; and `noteCard` leads with the Event log's `task-icon` box and the same `eventKindIcons` icon at 18px, with the kind in words kept in the line under the title, so a contact's Interaction history and Unfiled notes read like the Event log. The dial/link style was renamed `.contact-call` → `.contact-link` now that a map link shares it, and `.note-head` aligns the icon box's top edge with the title's. v0.2.10 gave the contacts list a Sort menu (Added order / A>Z / Newest first, in one `contactSort` state) and a **Hide resolved** toggle beside the search box, with the contact rows now built from one `matches` → `visible` pass so search, the resolved filter and the chosen order compose without reordering the snapshot; `taskRow` now suppresses **Needs attention** for `done` and `cancelled`, shows the task type as a badge with `taskKindIcons` beside the word, and reads an `everyoneAssignee` task as **Everyone**; the tasks list includes a shared task when it is filtered to either user but never under Unassigned; and `RecordForm` gained the `onOpenInteraction` prop, so a task's **Create interaction** button hands a pre-filled `Editor` back through `setEditor`.
- `src/components/record-form.tsx`: organisation (multi-project checkboxes), interaction, task, and project forms, follow-ups, conflict/draft recovery. The Organisation list is **controlled** in v0.2.5 so a contact created from the dialog can show as the chosen one, and it carries an extra `+ New contact…` option that reveals name (required), email and phone. Choosing it sends the record with no organisation and the contact details separately, and a single server action creates both. Document edit now: `Current links – this file is reused` section showing each `documentLink` with badge and Remove button using `Link2Off` icon calling `unlinkDocument(id)`, local state `localDocLinks` syncing via effect, Tip line with `Lightbulb` icon "Tip: removing a link(s) does not delete the file". Add links fieldset with 3 optional dropdowns (organisation, project, task) nullable – on save after `saveRecord` succeeds, iterates selected values and calls `linkDocument({documentId, organisationId/projectId/taskId, interactionId:null})`, ignoring duplicate "already" errors. File never deleted on unlink. v0.2.8 added a Project dropdown (No project, then every project, preselected when editing) to the interaction form, create and edit alike. v0.2.9 added a Map link input to the organisation form — `type="url"`, labelled “Optional – paste a Google Maps link” — sent as `mapUrl` with the rest of the record. v0.2.10 added the Type of task dropdown (No type plus the five `taskKinds`), renamed the task's Detail to **Task Start** and added **Task Outcome** beside it, added **Everyone** to the Assigned to list, and added the **Create interaction** button: `submit` now takes an optional `afterSave` callback so the button can save the task and then hand a pre-filled `Editor` to the workspace instead of closing. The `Editor` type gained an optional `initial` map, which `initial` falls back to when no existing record is being edited — so a new interaction opens with the task's contact, project, title, outcome and kind already in place, every part of it still editable. Task Start uses `readOnly`, never `disabled`, because a disabled field is left out of the submitted form and would quietly clear it; the padlock beside the label is a `startLocked` state that only appears for a task that already exists, and it carries the word Locked or Unlocked rather than relying on the icon.
- `src/components/finance-forms.tsx`: `FinanceRecordForm` (kind, title, pounds amount, date, category, paid-personally/beneficiary, organisation, project, notes; version-conflict aware), `FinanceMovementDialog` (add proceeds/payment/reimbursement, list recorded movements with void/bin, linked receipts with View/Download/Remove link, attach or link existing document), and `FinanceVoidDialog` (reason required, reinstate supported).
- `src/components/record-summary.tsx`: readable history and comparison fields, aware of deleted records, project links, and documents. v0.2.9 captions the new column “Map link” so a revision reads plainly. v0.2.10 captions **Outcome** and reads an `everyoneAssignee` assignee as “Everyone”.
- `src/app/actions.ts`: authenticated server actions for save, soft-delete, restore, permanent delete, `uploadDocument`, `linkDocument`, `unlinkDocument`, and from v0.2.5 `linkTaskToOrganisation` and `saveRecordWithNewOrganisation`. Upload validates size (20 MB), safe storage name, creates document + optional initial link transactionally, keeps file on link failure.
- `src/app/api/documents/upload/route.ts`: streaming multipart upload added in v0.2.4 so a 20 MB file is not bound by the Server Action 1 MB default; the browser prefers this route and falls back to the `uploadDocument` action. `next.config.ts` raises `experimental.serverActions.bodySizeLimit` to `25mb` and must keep it nested under `experimental`.
- `src/app/api/documents/[id]/download/route.ts`: protected download, uses `readFile` buffer to avoid `ReadableStream already closed` on concurrent downloads, sets safe Content-Disposition with original name, inline vs attachment via `?download=1`, checks auth and deleted state.
- `src/lib/documents/storage.ts`: `documentsPath()` returns `DEMO_DOCUMENTS_PATH`/`DOCUMENTS_PATH` env, `safeStorageName()` UUID + safe extension, `safeOriginalName()` strips control chars and path, `fullPath()` guards traversal, `ensureDocumentsPath()`.
- `src/lib/records/store.ts`: transactional writes, organisation-project join handling, revision history, optimistic version checks, resolution warnings, recoverable bin with no auto-purge, safe restore checks, non-cascading permanent deletion retaining revision metadata. v0.2.5 added `linkTaskToOrganisation` (reads the current task itself, changes only `organisation_id`, keeps the optimistic version check, refuses a task that already belongs to another contact, and refuses one whose source note belongs elsewhere) and `saveRecordWithNewOrganisation` (creates the contact and the task or note inside one `db.transaction`; a failure rolls both back). `saveOrganisation` and `saveInteraction` were lifted to the top of the factory as local functions so they can be called inside that transaction, matching the existing `saveTask` pattern. Document methods: `createDocumentFromUpload`, `saveDocument` (friendlyName/category only), `linkDocument` (validates exactly one target, duplicate returns existing id), `unlinkDocument`, soft-delete preserves links, permanent delete cascade removes links and file reference is removed by action layer. v0.2.8 links an interaction to one optional project: saving refuses an unknown or binned project, permanently deleting a project clears `interactions.project_id` rather than deleting the interaction, and restoring an interaction whose project is binned is refused until the project is restored. v0.2.9 needed no store change of its own: `saveOrganisation` already writes every validated field, so the map link rides along into the row, the audit trail and the snapshot. v0.2.10 lets `everyoneAssignee` through the assignee check in `relations()` — every other unknown assignee is still refused with “Choose one of the two workspace users” — and writes the new `kind` and `outcome` columns the same way, since `saveTask` persists whatever `taskInput` validates.
- `src/lib/records/validation.ts`: input schemas for organisations (with projectIds), tasks, interactions, projects, `documentInput` (friendlyName, category), `documentLinkInput` (exactly one of organisationId/interactionId/taskId/projectId/financeRecordId), `taskLinkInput` (`taskId`, `organisationId`, `version`), an optional interaction `projectId` that defaults to null so records saved before v0.2.8 still validate, `maxDocumentSizeBytes`, `documentCategories`, the finance inputs (`financeRecordInput`, `financeMovementInput`, `financeVoidInput`, `financeKinds`, `financeCategories`, `movementKindFor`), and, since v0.2.9, an optional `mapUrl` on `organisationInput`: blank or null becomes null, a present value must parse as an http(s) URL of at most 2000 characters or is refused with “Enter a link that starts with http:// or https://”, and a payload with no `mapUrl` key at all still validates, so contacts saved before v0.2.9 are untouched. Since v0.2.10 it also holds `taskKinds`, `everyoneAssignee`, and an optional `outcome` and `kind` on `taskInput`, both nullable with a default of null so every task saved before this release still validates; and `taskStatuses` now lists `scheduled` where it listed `waiting`.
- `src/lib/contacts/contact-links.ts` (v0.2.6): `phoneForDialling` (strip spaces, hyphens, brackets and dots; keep a leading `+`), `telHref` (null when fewer than three digits survive, so a number typed as words gets Copy only), `canCopy`, and `copyText(value, clipboard?)` which resolves true only when the clipboard confirmed the write and takes the clipboard as an optional argument so the unit tests can pass a stub. Pure functions, no DOM assumptions beyond `navigator.clipboard`.
- `src/lib/contacts/document-links.ts` (v0.2.7): `documentLinkItems` resolves a document's direct links into typed row items — a live contact is tappable with its id and name, a binned contact is plain text with its name, a note or task by title, a project by name, and a link to a financial record only produces no item (a pre-existing quirk, carried over on purpose). Pure function, no database, thirteen unit tests.
- `src/lib/finances/money.ts`: integer-pence parsing and formatting (`parsePoundsToPence` rejects signs, more than two decimals, and anything non-numeric), `formatPence`, `formatPencePlain`.
- `src/lib/finances/summary.ts`: `financeSummary(records, movements, users)` – the single source of every total (assets estimated vs proceeds, liabilities owed/paid/outstanding, cash in/out including liability payments, per-user reimbursement owed, per-beneficiary distributions, excluded voided/binned counts). Voided and binned records, and movements against them, are excluded.
- `src/lib/finances/store.ts`: `saveFinanceRecord`, `saveFinanceMovement`, `setFinanceVoid`, `deleteFinance`, `restoreFinance`, spread into `recordStore` so the snapshot and all finance writes come from one entry point. Over-repayment and over-payment are refused with the remaining amount; reimbursements require a personally paid expense; a record with money against it cannot change type; permanent deletion always throws.
- `src/lib/finances/csv.ts` and `src/lib/finances/export.ts`: quoted CSV with apostrophe-prefixed formula protection, UTF-8 BOM, money as plain decimals, `inventory`/`cash`/`reimbursements` views.
- `src/app/api/finances/export/route.ts`: authenticated CSV download; 401 without a verified Cloudflare identity, 400 for an unknown view, `private, no-store`.
- `src/lib/records/errors.ts` and `src/lib/records/audit.ts`: shared `RecordError`, `versionConflict`, `assertActor`, and `auditEntry` used by the records, finance and checklist stores.
- `src/lib/records/checklist-store.ts`: `seedTemplates`, `saveTemplateItem`, `deleteTemplateItem`, `restoreTemplateItem`, `applyTemplate`. Applying creates undated, unassigned tasks in the chosen project and skips anything already there (by `templateItemId` or by normalised title). `src/lib/records/template-seeds.ts` holds the wording – currently the tailored 16-item Notifications, 21-item Probate & Estate Administration, and 25-item Funeral lists, stored so they stay editable.
- `src/lib/backup/backup.ts`: versioned encrypted archive creation and restore. SQLite's online backup API is held under an immediate write lock while the database snapshot and regular document files are collected; scrypt-derived AES-256-GCM authenticates the archive, and restore validates metadata plus SQLite integrity before replacing data.
- `src/components/checklist.tsx`: the collapsed `ProjectChecklist` panel inside each project, plus `TemplateItemForm` for rewording, adding and removing suggestions.
- `src/components/backup-panel.tsx`: authenticated encrypted backup download and destructive restore controls with password handling kept in the browser form only.
- `src/lib/db/schema.ts` and `drizzle/`: schema and versioned migrations including `organisation_projects`, `documents`, `document_links`, and `deleted_at` columns. Add migrations; do not replace existing history. v0.2.8 added migration `0006_event_log_project_link`: a nullable `interactions.project_id` with a foreign key to `projects`, so existing rows are untouched and nothing is backfilled. v0.2.9 added migration `0007_contact_map_link`: a nullable `organisations.map_url`, applied at startup like the others, existing rows untouched and nothing backfilled. v0.2.10 added migration `0008_task_type_outcome_and_scheduled`: nullable `tasks.outcome` and `tasks.kind`, plus a hand-written `UPDATE tasks SET status = 'scheduled' WHERE status = 'waiting'`. The two columns came from `drizzle-kit generate`; the UPDATE had to be written by hand, because the rename is a change to data rather than to the schema — `tasks.status` is plain TEXT with no database enum, so the generator has nothing to emit for it.
- `src/lib/auth/`: Cloudflare verification and explicit development identity. Never introduce a production fallback.
- `src/app/globals.css` and `src/themes/index.ts`: approved calm theme and token foundation; project pills, doc pills, and bin actions reuse existing tokens.
- `tests/`: 94 unit/integration tests. `tests/records.test.ts` covers Bank1 flow, project creation/renaming, organisation-project links, bin soft-delete/restore, permanent deletion, non-cascade behaviour, London DST, and three document tests. `tests/finances.test.ts` covers money parsing/formatting, asset estimate vs proceeds, liability part payments, the GBP 500/GBP 200/GBP 300 reimbursement case with no second expense, over-repayment and non-personal refusals, void/reinstate/correct history, bin and restore with permanent deletion refused, per-beneficiary distributions without a 50/50 assumption, stale-edit conflicts, receipt linking, CSV formula protection and totals separation. Checklist tests cover all three lists, duplicate-safe application, and editable suggestions. `tests/backup.test.ts` covers encrypted database/document inclusion, clean restore, metadata, and wrong-password failure. `tests/links.test.ts` covers document linking from both directions and, since v0.2.5, the task-to-contact link: attaching an unlinked task, a stale version being refused instead of overwriting, a task that already belongs to another contact not being moved, a contact in the bin and a missing task being refused, a note-derived task being refused for a different contact, and contact-plus-record creation in one transaction including the rollback case where no contact is left behind. `tests/contact-links.test.ts` (v0.2.6, nine tests) covers the popup's helpers with no database at all: numbers typed with spaces, hyphens, brackets, dots or a leading `+`; a value that is not a number and therefore gets no `tel:` href; an empty or whitespace-only value that gets no copy button; and `copyText` returning true only when the injected clipboard confirms the write — false when it throws and false when there is no clipboard. `tests/document-links.test.ts` (v0.2.7, thirteen tests, no database) covers the document row's link items: a directly linked live contact is tappable, two linked contacts are two items in link order, a binned contact is plain text with its name, unknown ids fall back to the app's plain names, note and task links resolve to their titles with binned ones falling back, a project resolves by name, a financial-record-only link stays invisible (the pre-existing quirk), and a mixed line keeps the row's link order. Four tests in `tests/records.test.ts` (v0.2.8) cover the interaction's project link: saving with an unknown project id and with a binned project are both refused, permanently deleting a project clears the link and keeps the interaction, and restoring an interaction whose project is binned is refused until the project is restored. Two tests in `tests/records.test.ts` (v0.2.9) cover the map link: validation accepts http(s) addresses and refuses a bare domain, plain words, a non-http scheme and an unparseable address with the plain message, and a save–change–clear round trip whose revisions record the link before and after each step while a refused save leaves the version untouched. Six tests (v0.2.10, five in `tests/records.test.ts` and one in `tests/database.test.ts`) cover what followed: a task's type saving, changing and clearing with each step in the history and an unknown type refused; Task Outcome surviving beside Task Start without either overwriting the other, and a task with no outcome storing null rather than an empty string; `scheduled` accepted and `waiting` refused outright; a task given to Everyone saving while a name outside the two users is still refused; and the migration itself, which replays history — migrate to `0007`, write a row in the old spelling with raw SQL because the current schema already knows the new columns, let `0008` run, then check the row reads `scheduled` with both new columns null and that an untouched `to_do` row never moved.

### Restarting and checking the app

Do not assume the previous conversation's live server, dependencies, browser installation, or fictional database survived into the next workspace. Check the environment first.

```bash
npm ci --ignore-scripts   # plain npm ci fails compiling better-sqlite3 in the sandbox
DATABASE_PATH=./data/demo.sqlite npm run db:migrate
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-contacts.ts   # optional
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-documents.ts  # optional, needs the contacts seed
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-events.ts     # optional
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-finances.ts   # optional
DEV_AUTH_ENABLED=true NEXT_TELEMETRY_DISABLED=1 npm run dev -- --port 3000
```

Use the agent's long-running process tool for the development server. It binds to `0.0.0.0`; the configuration permits Arena preview hosts. Use fictional information only — the production installation holds real records now, so the demo database must stay in `data/demo.sqlite` and `data/demo-documents`, separate from the production files. The development-only Alex/Jamie switch lets the user try attribution and shared activity. There is no required example-data seed; a new demo database starts empty except for starter projects. The optional seeds above are idempotent and refuse a database path without `demo` in it; `seed-demo-contacts.ts` (v0.2.6) exists so the contact popup can actually be exercised, and gives one contact every field filled in with two phone numbers in different formats, one with only a name and a phone, and one with nothing added. `seed-demo-documents.ts` (v0.2.7) adds three fictional documents with small generated PNGs — one linked to one contact, one to two contacts, one only through a note — so the Documents tab and its contact popups can be exercised; it needs the contacts seed first. `seed-demo-events.ts` (v0.2.8) writes nine fictional interactions across all five kinds, both recorders, and contacts and projects with and without, so the Event log's nine rows exercise the search and every filter. Since v0.2.9 the contacts seed gives the fully filled contact a fictional Google Maps link, while the other two keep the row empty so “Not added” can be seen.

```bash
npm test
npm run typecheck
npm run format:check
NEXT_TELEMETRY_DISABLED=1 npm run build
npm audit --omit=dev
# With the demo server running and a compatible Chromium installed:
npm run test:e2e
```

At the v0.2.6 checkpoint, all 70 unit/integration tests, the TypeScript check, Prettier and the production build pass. Production dependency audit: zero findings; four moderate dev-only Drizzle/esbuild findings remain. `npx playwright install chromium` could not download a browser in the sandbox in September 2026, so the browser suite was not run and a per-change check used a temporary server-render harness instead; if a browser is available, prefer the real e2e run. A locally extracted Chromium was used in earlier sessions; do not assume its executable exists now. Browser tests create fictional records in the demo app.

### GitHub handover

- Repository: `dougalbob/estate-tracking`.
- Work stays on the branch the current Arena session created for itself, normally `arena/<session-id>-estate-tracking`. Session ids differ per task, so never copy a branch name out of this document, an older handover, or an earlier session's pull request: doing so puts a session's work on a branch it does not own. Do not create or switch branches outside the session's own branch, and push only to it.
- Keep GitHub-visible actions deliberate: review the local gates first, confirm before merging or opening/updating a pull request, merge to `main`, then create a version tag to publish the container.
- **Update this plan and the README in the same pull request as the change, before merging** — see the documentation rule above. The release procedure is: gates green → documents corrected → pull request reviewed → merge → tag → GitHub Actions publishes.
- The user prefers milestone commits and pushes, and plain-English explanations of tests and previews. They approve each merge and each version tag before it is pushed, even though earlier releases have gone smoothly.

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

**Implemented details (Sept 2026):**

- `documents` table: id, friendlyName, originalName, storageName (UUID+ext), mimeType, size, category, version, createdBy, createdAt, updatedAt, deletedAt.
- `document_links` table: id, documentId (cascade), organisationId/interactionId/taskId/projectId (cascade, exactly one required).
- Storage path: `DOCUMENTS_PATH` env default `./data/documents` → host `/mnt/user/appdata/estate-organiser/documents` via Docker volume; demo mode `DEMO_DOCUMENTS_PATH`/`./data/demo-documents`.
- Upload: 20 MB limit, `safeStorageName`, `safeOriginalName`, `ensureDocumentsPath`, buffer read for download route to avoid closed stream.
- Links: reusable – one file linked to many orgs/tasks/projects/notes; `linkDocument` returns existing id on duplicate; `unlinkDocument` removes link only, file stays.
- Edit document UX: Current links with badge + Remove button (Link2Off red-slash icon) that confirms and calls `unlinkDocument`, updates local state, refreshes snapshot; Tip with Lightbulb icon "Tip: removing a link(s) does not delete the file"; Add links fieldset with 3 optional dropdowns (contact, project, task) nullable, lean.
- Bin: soft-delete preserves file and links; restore checks file existence; permanent delete removes file reference and cascade removes links, retains revision history.
- Documents view decluttered per user: friendlyName + category·linkedNames + "Uploaded on {date} by {user}" – single Upload button, no sizes/mime in row, viewer header simplified.
- Viewer: in-app dialog with close button, image inline, PDF iframe, download button with multi-method fallback for Arena preview sandbox.

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
- Tasks, interactions and finances have one optional project; organisations and documents support multiple projects.
- Documents have independent identities and link records; attachment duplication is not the normal workflow.
- Revision and activity records capture server-verified actors. Financial voids/corrections remain traceable.

These are implementation directions, not a final database schema. Validate them against the agreed workflows before migrations are established.

## Remaining technical choices and working assumptions

No further product questionnaire is required before starting. Resolve technical details during design and document them explicitly. The notes below have been kept as written in September 2026, with the outcome added where a choice has since been made and shipped:

- **Backup workflow:** manual download and user-managed cloud copy initially; scheduled laptop transfer is future scope. **Resolved:** manual encrypted download as a `.estate-backup` bundle, a versioned header, scrypt-derived AES-256-GCM, zero server retention after download, and a password that is never stored or logged. Scheduled transfer remains future scope.
- **Dates:** date-only task dates interpreted in Europe/London; store interaction/audit instants in UTC and display locally.
- **Uploads:** supported formats, size limits, and available server storage need documented configuration. Current: PDF, images, text, 20 MB limit, configurable via `documentCategories` and `maxDocumentSizeBytes`.
- **Deletion:** which identifying metadata remains in history after ordinary permanent deletion; never describe recoverable bin as erasing backup copies. Current: revision history retained for all entities including documents; file removed only on permanent document delete.
- **Financial detail:** confirm precise field labels and reconciliation behaviour with sample transactions before building summaries. **Resolved:** the three summaries (inventory, cash, reimbursements) are built and unit-tested, including the GBP 500/200/300 case, part payments and voids, and the user has worked with them in production.
- **Themes:** extensible token system and one default theme now; no theme editor, additional palette, or preference selector promised for first release.

## Release gate

All six stages are required for the polished initial release. Run unit/integration tests, critical two-user end-to-end workflows, accessibility checks, authentication bypass checks, production container smoke tests, and a clean restore exercise. Record actual results and outstanding limitations; do not describe planned features as shipped.

**Position on 17 September 2026:** unit/integration tests, the type check, formatting, the production build, the published container smoke test, both users signing in through Cloudflare Access, and the clean restore through the published image have all passed. The accessibility review and a formal security review are the parts of this gate that are still open, and the same two are carried in the current-state table at the top of this document. Whole browser end-to-end runs need a machine with a browser, which the sandbox does not provide.

## Earlier foundation checkpoint — 16 September 2026

Implemented: Next.js 16.3.5/React shell, semantic default-theme tokens and registry, responsive fictional overview, explicit development identity, JWT verification and two-user allowlist, initial organisation migration, and database connection foundation.

Verified: eight automated authentication/database tests; TypeScript check; production build; HTTP checks for fictional preview rendering and a protected production page despite a spoofed email header. Migration applied successfully and repeat-application tested in memory. Production dependency audit: zero findings. Development tooling: four moderate findings in the Drizzle/esbuild chain remain unresolved.

Not yet verified at that checkpoint: full browser/accessibility review, live Cloudflare identity exchange, Unraid deployment, and additional-theme coverage. At that checkpoint, there were no record-write endpoints or functional task/note forms. Later checkpoints supersede the record-write limitation, and the live Cloudflare identity exchange and the Unraid deployment were verified in production on 16–17 September 2026. The accessibility review and additional-theme coverage are the parts still open.

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

Verified: 16 unit/integration tests; production build; TypeScript and formatting checks; Chromium end-to-end test using two independent user sessions, persistence across reload, revision history, conflict recovery, resolution warnings, task completion, and mobile quick capture without horizontal overflow. Standard browser download was blocked by sandbox network; browser run used locally extracted Chromium instead. Generated browser binaries/screenshots and demo records are not tracked in Git.

## Project management and recoverable bin checkpoint — 16 September 2026

Implemented:

- Project creation and renaming with case-insensitive duplicate prevention, versioned edits, and audit history. Starter projects (Funeral, Notifications, Probate & Estate Administration) backfilled with version/timestamps.
- Organisation-to-project links via `organisation_projects` join table; organisations can belong to multiple projects, tasks to one optional project. Organisation form now shows project checkboxes; project view shows linked organisations and tasks.
- Recoverable bin with no automatic purge: soft-delete for organisations, interactions, tasks, and projects moves records to bin; restore validates linked records and checks for name conflicts; permanent deletion requires prior bin move and explicit typed confirmation (`DELETE`), retains revision history, and unlinks rather than cascade-deletes notes/tasks/documents.
- Safe relationship handling: deleting an organisation leaves its interactions and tasks intact (organisationId cleared only on permanent deletion); deleting a project unlinks tasks and organisation links but does not delete them; deleting an interaction unlinks its follow-up tasks.
- UI: new “Recoverable bin” navigation with count, restore and permanent-delete actions, history entries for deleted/restored/permanently_deleted, project pills with edit affordance, and bin buttons on task rows, note cards, and organisation details. Approved calm theme preserved.
- Validation: project name required, max 200 chars; organisation projectIds validated against active projects; delete/restore check version and deletedAt state.

Verified:

- 22 unit/integration tests (previously 16) – all passing.
- TypeScript, production build, Prettier passing.
- Development preview manually checked.
- Browser e2e not rerun in this sandbox due to blocked Chromium download; covered by unit/integration tests and manual preview.

## Document storage and linking checkpoint — 16 September 2026

Implemented:

- Documents table and document_links join table with safe storage names (UUID+ext), friendly names, categories, size, mimeType, versioning, soft-delete.
- Authenticated upload (`uploadDocument` action) with 20 MB limit, safe filename handling preventing path traversal, demo vs production path isolation (`DOCUMENTS_PATH` env default `./data/documents` mapping to host `/mnt/user/appdata/estate-organiser/documents`, demo `./data/demo-documents`).
- Reusable linking: one file linked to many organisations/interactions/tasks/projects via `linkDocument`, duplicate returns existing id, `unlinkDocument` removes link only – file stays.
- Download route `/api/documents/[id]/download` protected, uses `readFile` buffer (fixes `ReadableStream already closed` on concurrent downloads), inline view vs `?download=1` attachment, original name preserved.
- In-app viewer dialog with close button returning to workspace (fixes Arena preview `allow-popups` block), image/PDF handling.
- Download UX: anchor+download attr, hidden iframe, fetch blob+object URL, direct link fallback – all logged, works in sandboxed preview and production.
- Organisation detail enhanced: shows direct + via-project + via-notes/tasks documents, with Remove link per direct link.
- Projects view: docs per project with View/Download/Attach/Link existing.
- Documents list: search by friendlyName/originalName/category/linked record names, category filter, decluttered row (friendlyName + category·linkedNames + "Uploaded on {date} by {user}"), single Upload button, simplified viewer header, formatDate accepts string|Date.
- Edit document polish: friendlyName/category unchanged, Current links section with badge per link (Contact/Project/Task/Note) each row has Remove button with `Link2Off` icon calling `unlinkDocument(id)`, updates local state `localDocLinks`, refreshes snapshot; Tip line with `Lightbulb` icon "Tip: removing a link(s) does not delete the file"; Add links fieldset with 3 optional dropdowns (organisation, project, task) null-allowed – on save after `saveRecord` succeeds iterates selected values and calls `linkDocument`, ignoring duplicate "already" errors. Removed "Pick any combination…" help text per user request.
- Bin: documents included, soft-delete preserves file+links, restore checks file existence, permanent delete removes file reference and cascade deletes links, retains revision history.
- Safe relationship: deleting linked org/task/project does not delete document, only unlinks.

Verified:

- 25 unit/integration tests (previously 22) – all passing, including 3 new document tests: upload/edit/link reusable/unlink preserves file, bin preserves file/links + permanent delete removes file ref and retains history, deleting linked record does not delete document.
- TypeScript check passing, production build passing.
- Development preview manually checked: upload, edit friendlyName, link reusable across org/project/task, unlink preserves file, viewer close button, download save dialog, bin restore/permanent delete, decluttered row, Edit document Remove button with Link2Off icon.
- Browser e2e not rerun due to sandbox network restrictions; existing workflow still exercises core Bank1 flow. New document flows covered by unit/integration tests and manual preview checks.

Remaining: Stage 4 Estate Finances (GBP integer pence, assets/liabilities/income/expenses/personal funding/reimbursements/distributions, summaries, CSV exports), Stage 5 templates/mobile polish, Stage 6 backups/deployment. End-to-end tests add fictional example records and are intended only for isolated demo preview.

## Stage 4 checkpoint — Estate finances (16 September 2026)

Implemented:

- One finance model (`finance_records` + `finance_movements`, migration `0004_zippy_sunspot`): assets with estimated values and sale proceeds, liabilities with part payments, income, expenses paid from the estate or personally by either user, reimbursement movements, and distributions recorded against either beneficiary. Every amount is an integer number of pence; GBP only.
- One shared calculation (`financeSummary`) feeds the screen, the CSV exports, and the tests, so the same figures cannot disagree. Voided and binned records, and movements against them, are excluded from every total.
- Separate summaries: assets versus liabilities (estimate, proceeds, still to realise, owed, paid, outstanding), cash movements (money in split into income and sale proceeds; money out split into estate expenses, liability payments, reimbursements, and distributions; net), and amounts awaiting reimbursement per person.
- Reimbursements settle money already recorded as a personally paid expense. A £500 expense with £200 reimbursed leaves £300 owed with exactly one expense in the totals. Part payments are supported; over-repayment and over-payment of a liability are refused with the amount still outstanding, and an estate-paid expense cannot be reimbursed.
- Corrections keep every version, editor, and time in the shared history. Voiding requires a reason, keeps the record visible, takes it out of the totals, and can be reinstated. Financial records can be binned and restored but never permanently deleted: the store refuses it and the bin shows "Correct or void instead".
- Receipts and invoices link to financial records using the existing reusable document links (`document_links.finance_record_id`); the upload dialog, the link picker, and the document edit form all offer financial records.
- Three authenticated CSV downloads (`/api/finances/export?view=inventory|cash|reimbursements`): values quoted, formula starts (`= + - @`, tab, carriage return) prefixed with an apostrophe, UTF-8 BOM for Excel, money as plain decimals with separate money-in and money-out columns, and no leading minus signs.
- No tax, debt-priority, or entitlement calculation is implemented anywhere.
- Layout unchanged: the approved calm theme, tokens, sidebar, and row patterns are reused, with three summary panels above the existing list/toolbar style.

Verified:

- 38 unit/integration tests passing (25 existing + 13 new finance tests).
- TypeScript check, Prettier check, and production build passing.
- Fresh migration from scratch creates all eleven tables; the demo database migrated and rendered the finances screen with correct figures (assets £250,000 estimate vs £255,000.50 proceeds, £2,000 outstanding on a part-paid liability, £300 still owed after a £500/£200 reimbursement).
- CSV downloads checked through HTTP: correct headers, filenames, and rows; unknown view returns 400.
- Production mode without Cloudflare authentication: the page shows the protected-workspace message, the CSV route returns 401, and a spoofed `cf-access-authenticated-user-email` header is ignored.
- Demo seed (`scripts/seed-demo-finances.ts`) writes fictional rows only, and refuses a database path without `demo` in it.

At that historical checkpoint, remaining work was full browser e2e coverage for the finance dialogs in a sandbox that permits a browser, accessibility polish, and the user's first pass through the screen. Later checklist and deployment work is recorded below.

## Checklist templates — first list delivered (16 September 2026)

Context: the user was unsure whether checklist templates were worth building, so the value was discussed and a single list was agreed as a trial rather than all three.

Implemented:

- `task_templates` table (migration `0005_curvy_mattie_franklin`) plus `tasks.template_item_id`, which records which suggestion created a task. Deliberately not a foreign key: removing a suggestion must never touch the task.
- The **Notifications** list, 16 suggestions written for the stated situation: a private pension and no employer scheme, no mortgage lender to notify, gas and electricity with the same supplier, broadband and landline listed separately from mobile, plus the usual Tell Us Once, banks, council tax, water, TV Licence, home insurance, post redirection, subscriptions, credit reference agencies, DVLA, and other services.
- Lists are ordinary records: wording can be edited, items added, and items removed (into the recoverable bin, restorable). Editing a suggestion never rewrites tasks already created from it.
- Applying is deliberate: items are unticked by default, there is a Select all shortcut and a live "Add N tasks" count, nothing is dated or assigned automatically, and already-present items are labelled **Already added** and cannot be selected twice.
- Duplicate prevention has two layers: the recorded `template_item_id`, and a normalised-title comparison against live tasks in the same project. Re-applying the list twice adds nothing.
- Each project shows its list collapsed behind a "Starter checklist" summary so the calm default layout is unchanged.

Verified:

- 44 unit/integration tests passing (38 previous + 6 checklist tests): seeding once and staying editable, no dates/owners created, re-application skipping duplicates, a binned task being re-addable, add/remove/restore of a suggestion leaving tasks untouched, project confinement, validation, attribution, and stale-edit conflicts.
- TypeScript, Prettier and production build checks passing.
- Demo preview checked: the panel renders inside Notifications with all 16 suggestions and their tailoring, applying two suggestions created two undated tasks attributed to the acting user, a second application skipped both, and the UI showed two "Already added" badges. The temporary demo tasks created for that check were removed again so the user starts with a clean list.

Remaining: the Funeral starter list, install metadata, and the Stage 5 dashboard/accessibility polish.

## Checklist templates — probate list added (16 September 2026)

Requested: a checklist for the probate procedure, English jurisdiction, an estate not expected to exceed £500,000, no Inheritance Tax expected, and no solicitor involved.

Implemented:

- **Probate & Estate Administration** list, 21 suggestions in roughly chronological order: whether a grant is needed at all; finding the will and who may apply; who applies (including reserving power); valuing the estate and the property as at the date of death; requesting balances from each institution; checking gifts in the seven years before death; confirming with HMRC whether an Inheritance Tax account is needed; checking whether an unused allowance can be transferred; applying for the grant; the statement of truth or oath; the fee and extra copies of the grant; waiting for the grant; registering it with each institution; paying the funeral account and debts; the property; estate accounts; income reporting; advertising for unknown creditors; distributions with a reserve; and knowing when to get advice.
- No threshold, rate, fee or date is quoted anywhere in the wording. Each line points at GOV.UK or HMRC to confirm the current position, and the list states plainly that the app performs no tax calculation. A unit test enforces this: the probate wording must not contain "£", "percent", any of the well-known threshold figures, or any number of three digits or more.
- Nothing about the user's specific figures is asserted. The wording covers both possibilities where they differ (a will or no will, one applicant or two, a transferable allowance or none).
- Lists are now held as `notificationsTemplateSeeds` and `probateTemplateSeeds`, combined into `templateSeeds`. Snapshot ordering became deterministic (project, then position, then title) so both lists read consistently.
- The same wording may appear in two different lists (for example a "Tell Us Once" line in more than one project), while an item can never be moved between projects.

Verified:

- 46 unit/integration tests passing (44 previous + 2 probate tests): list seeded once and tailored, no rules or figures quoted, applying creates undated and unassigned tasks in the right project, a second application skips everything, the two lists stay independent, and wording may repeat across lists.
- TypeScript, Prettier and production build checks passing.
- Demo preview checked: both checklist panels render inside their projects with no runtime errors and no figures leaked into the page.

Remaining: any rewording the user wants after reading the lists.

## Checklist templates — funeral list, and the list tuned to the user's stage (16 September 2026)

Situation given by the user: their mother died a few days ago; she had been widowed about fifteen years; all assets are in her name alone; the only beneficiaries are the user and their sister; no gifts in the seven years before death. The medical examiner has submitted findings to the registry office and the death certificate appointment is the next day. The funeral will be non-denominational at a crematorium with a celebrant, followed by a wake at a local pub, with catering still to be decided.

Implemented:

- **Funeral** list, 25 suggestions for exactly that plan: registration and certificates first; the separate cremation certificate from the medical examiner; choosing a funeral director and asking for an itemised quote; agreeing the day and slot; the celebrant and the tribute; the shape of the service; music; order of service; photographs; flowers or donations in memory; what she will wear and jewellery; transport; confirming the pub, the catering, and anything extra at the wake; telling people; a death notice; tracking guests; dress; recording the costs in Estate finances; the day before; the ashes as a later decision; and looking after each other afterwards.
- **Notifications** list tuned to the current stage: a new second item, "Order extra death certificates at the appointment", and the Tell Us Once wording now says the registrar offers the reference code at the registration appointment and that it can only be used once. The list was renumbered so both appointment items read first. This matters because registration is the next day and a second trip is avoidable.
- No burial, church, hymn or clergy wording appears anywhere in the funeral list, and a test enforces that. As with the probate list, no figure, fee or rate is quoted, and a test enforces that too.

Verified:

- 48 unit/integration tests passing (46 previous + 2 new): the funeral list is tailored to cremation, a celebrant and a pub wake; it avoids burial and religious wording; it quotes no figures; its costs item points at Estate finances and reimbursement; it applies and re-applies like the other lists; and the notifications list now leads with the two registration-appointment items in the right order.
- TypeScript, Prettier and production build checks passing.
- Demo preview checked: all three checklist panels render with no runtime errors, the funeral items read in the intended order, and none of the 62 suggestion explanations contains a money figure.

Deliberately not done: the app does not decide, state or calculate whether Inheritance Tax applies, whether an account is needed, or which allowances are available. The user's circumstances (widowed, all assets in her name, two children as beneficiaries, no recent gifts) are the kind of thing that can change which forms HMRC expects, so the wording tells the user to confirm the position rather than asserting it.

Next: the user is registering the death and meeting the funeral director, so the natural next work is supporting documents and receipts for the funeral and probate paperwork, and the Stage 6 backup work.

## Stage 6 checkpoint — production deployment package (16 September 2026)

Implemented:

- Multi-stage `Dockerfile` using Node 22 Bookworm slim. The build stage installs `python3`, `make`, and `g++` for the native `better-sqlite3` dependency, then the runtime receives pruned production dependencies, the built `.next` application, and the migration files.
- `docker-entrypoint.sh` loads `/data/estate.env` when present, creates the configured storage directories, applies migrations through the plain-JavaScript `scripts/migrate.cjs` runner, and starts Next.js on `0.0.0.0:3000`.
- Unauthenticated `GET /api/health` returns HTTP 200 with a small status response for Unraid and tunnel smoke checks. It does not expose application data or bypass authentication.
- `compose.yaml` documents the same GHCR image, bridge-style port mapping, persistent `/mnt/user/appdata/estate-organiser:/data` volume, restart policy, and healthcheck.
- `estate-organiser.xml` defines the Unraid user template with the `/data` mapping, host port `3005` mapped to container port `3000`, WebUI link, and app icon. The v1 root ownership implication is documented.
- `.github/workflows/publish.yml` publishes `ghcr.io/dougalbob/estate-organiser` on `v*` tags or manual dispatch, with version/latest/SHA tags and `GITHUB_TOKEN` package permissions. `.env.example` contains placeholders only.
- README deployment instructions cover appdata and `estate.env`, template import, first start, health checks, Cloudflare Tunnel and Google-only Access policy, anonymous GHCR pulls, Force Update, and the fictional-data gate.

Not verified in the sandbox at that point (both have since been verified in production):

- Docker build and native-module smoke test, because no Docker daemon is available here. GitHub Actions is the only builder: the first image was published at v0.2.0 on 16 September 2026.
- Live Unraid startup, Cloudflare Tunnel, Google Access exchange, and restricted-origin checks — completed for both users in production.

## Stage 6 checkpoint — encrypted backup and restore (16 September 2026)

Implemented:

- `src/lib/backup/backup.ts` creates a versioned `.estate-backup` bundle. It holds an immediate SQLite write lock, uses better-sqlite3's online backup API for a consistent snapshot, includes every regular file below the documents folder, and removes temporary server files after completion.
- The bundle uses scrypt-derived AES-256-GCM with a random salt and nonce. The authenticated header records only format and KDF parameters; the recovery password is never stored, logged, or included in the download URL.
- Restore decrypts into staging, authenticates the whole payload, checks entry metadata and SQLite integrity plus required tables, then replaces the database and documents. Replacement is rolled back if installation validation fails. Wrong passwords and corrupt archives fail without treating the restore as successful.
- Authenticated `/api/backup/download` and `/api/backup/restore` routes support the manual workflow. The workspace has a **Backup & restore** panel with browser blob download, explicit destructive-restore confirmation, and password fields that are not persisted.
- Server retention is deliberately zero after a completed download. The user retains dated encrypted copies and the recovery password separately, outside the app.

Verified at that checkpoint (61 tests now):

- 50 unit/integration tests passing, including encrypted database/document inclusion, nested documents, clean restore, metadata checks, and wrong-password failure.
- HTTP download smoke test returned the encrypted backup with `private, no-store`, `nosniff`, and attachment headers; the returned magic and encrypted bytes were verified independently of browser save permissions.
- HTTP restore smoke test returned success for a fictional demo database and HTTP 400 for a wrong password while preserving the existing data.
- TypeScript, Prettier, and the existing production build gates pass after the backup feature. Arena's iframe may still block the final browser save dialog; production HTTP/download behaviour remains the release verification step.

Remaining release gate at that checkpoint: push/review/merge, first GHCR build, live Unraid/Cloudflare setup on host port `3005`, and a clean restore through the published image before real estate data. **All four were completed between 16 and 17 September 2026**, and the installation has held real records since.

## Release history — 16 to 18 September 2026

Accurate as recorded in Git. Nothing here is planned; each tag is published on GHCR.

| Tag     | Published (UTC)    | What it was                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v0.2.0  | 16 September 15:54 | Production deployment package and encrypted backup/restore (pull request #4)                                                                                                                                                                                                                                                                                             |
| v0.2.1  | 16 September 18:34 | Backup restore fix: stage on the target filesystem to avoid `EXDEV` (pull request #5)                                                                                                                                                                                                                                                                                    |
| v0.2.2  | 17 September 08:58 | Document and task link UX, mobile selection fix, installable PWA (pull request #6)                                                                                                                                                                                                                                                                                       |
| v0.2.3  | 17 September 12:04 | Docker: copy `public/` into the runtime image so PWA assets are served (pull request #7)                                                                                                                                                                                                                                                                                 |
| v0.2.4  | 17 September 17:51 | Document upload fix: show upload errors, raise the body limit, add the streaming `/api/documents/upload` route, and nest `serverActions` under `experimental` so the image builds (pull requests #8 and #9)                                                                                                                                                              |
| v0.2.5  | 17 September       | This change: link an existing task to a contact from the contact screen, create a new contact from inside the task or note dialog, and refresh this plan and the README                                                                                                                                                                                                  |
| v0.2.6  | 17 September       | This change: the contact name on a task row opens a small popup with the numbers, email and reference, tap-to-dial and copy buttons (pull request #11)                                                                                                                                                                                                                   |
| v0.2.7  | 17 September       | This change: directly linked contact names tappable on document rows (the same popup, with a “Back to documents” close), and tap-to-dial and copy on the contact screen itself, which now shares the popup's field list (pull request #12)                                                                                                                               |
| v0.2.8  | 18 September       | This change: an Event log tab over every interaction with search and filters, one optional project on an interaction, and migration `0006_event_log_project_link` (pull request #13)                                                                                                                                                                                     |
| v0.2.9  | 18 September       | This change: a map link typed in by hand on each contact, a Notes label on the contact screen, the Event log's kind icons on interaction cards, and migration `0007_contact_map_link` (pull request #14)                                                                                                                                                                 |
| v0.2.10 | 19 September       | This change: a Sort menu and a Hide resolved filter on the contacts list; a type, a Task Outcome and a Create interaction button on the task; an Everyone assignee for work the two users share; **Needs attention** no longer shown on finished tasks; the Waiting status renamed to Scheduled; and migration `0008_task_type_outcome_and_scheduled` (pull request #15) |

## v0.2.5 checkpoint — contact links, and receipts on financial records (17 September 2026)

Implemented:

- **Receipts on financial records** and **an existing task attached to a contact** — both directions of the same idea: do the obvious next step in the screen you are already in.
- **Link an existing task to a contact.** The contact screen's **Linked tasks** toolbar now has **Link existing task** beside **Add task**. The picker lists only tasks with no contact yet, offers a title/detail search, and shows each task's status, project and next date. A task is one column (`tasks.organisation_id`), so linking is an update to that task: **no migration was needed**, and the server reads the current row itself rather than accepting a whole record from the browser.
- Nothing else about the task changes. The title, detail, dates, assignee, project, documents and history are untouched, the version still increments, and the change appears in the task history.
- Refusals are deliberate and worded plainly: a task that already belongs to another contact is **not** silently moved (attach only, as agreed with the user), a task whose source note belongs to a different contact is refused because a note and its follow-ups must share an organisation, a contact in the bin is refused, and a stale version is refused with the picker refreshed so the link can be retried.
- **Create a contact from the task or note dialog.** The Organisation list gained **+ New contact…**, revealing a name (required), email and phone (both optional). The list became a controlled input so the new contact can be shown as the chosen one.
- **One save, not two.** `saveRecordWithNewOrganisation` creates the contact and the task or note inside a single `db.transaction`. If the record cannot be saved, the contact is not created and the dialog keeps everything typed, so a failure can never leave an orphan contact. A unit test asserts the rollback explicitly.
- The project, document and organisation forms do not render the Organisation list at all, so they are unaffected. This was verified by rendering each form and checking the option is absent, rather than assumed.
- Wording explains the behaviour in both places: what linking does and does not change, and that a failed save creates nothing.
- **Receipts from the financial record dialog (added later the same day, at the user's request).** Adding a record now offers a file (with a category, receipt by default) and/or a document already stored, queued and attached as the record saves; editing a record lists its receipts with View, Download and Remove link, plus "Upload a receipt" and "Link an existing document", matching the movement dialog. The record is saved **before** attachments are attempted — deliberately the opposite order to the orphan-contact rule above, and for the same reason: a lost money record cannot be recovered by the user, whereas a missed receipt can be added again from Edit. Failures are reported in the message area, never swallowed, and the record's figures are never rolled back by an attachment failing.
- The document count on a row became a chip (paperclip, tinted pill, primary colour) rather than the words "· 1 document" at the end of a metadata line, because the user reported missing it. It is not colour alone: the chip carries an icon and the count in words. It marks **finance rows**; on **task rows** the linked documents are already listed by name, so the chip was dropped there rather than repeating the same fact twice.
- **A linked document's name opens it.** The friendly-name pills on a task row (and in the task edit dialog's "Linked documents" section) are now buttons that open the in-app viewer used everywhere else. They keep a hover state, the app's focus outline and an accessible name, and Remove link is unchanged.
- The upload call was extracted to `src/components/document-upload.ts` (route handler first, server-action fallback, size guard, error wording) so the document dialog and the finance dialog cannot drift apart.

Verified:

- **61 unit/integration tests** (53 before), TypeScript, Prettier and the production build all pass. Eight new tests cover the two features, including the rollback case.
- A temporary server-render harness rendered the contact screen, the picker, and the task, note, project, document and organisation forms against the demo database, and checked the sixteen expected strings and absences. It was deleted after use; no test-only code remains in the repository.
- For the receipts work, a second harness rendered the finances list and the Add and Edit dialogs (17 checks: file input, existing-document picker, linked receipt list with View/Download/Remove, both empty states, the save-then-attach wording, and the chip appearing only where documents exist). The exact upload request the new dialog sends was also run against the dev server with `curl -F`: it returned `ok`, stored the file and created the finance link in one request.
- `npx playwright install chromium` cannot download a browser in this sandbox, so the real browser e2e suite was not run for this change. The user sees the result in the Arena preview and in the released app.

Not covered here:

- The published image was not built in the sandbox (no Docker daemon); GitHub Actions builds it from the tag.
- The accessibility and security review is still the outstanding item from the release gate.

## v0.2.6 checkpoint — a contact popup on the task row (17 September 2026)

Implemented:

- **The contact name on a task row is a link that opens a popup.** The request was to make the inert organisation label tappable so the phone number and email could be seen without leaving the task list. It opens over the list rather than navigating away, so the task stays underneath; the app's existing dialog pattern is used, not a hover card or an inline expansion.
- **What it shows**: the contact's name and status, then Main contact, Phone numbers, Email and Account / reference — the contact screen's labels, in the contact screen's order, with `"Not added"` for an empty field. Notes are deliberately left out; **Open full contact** is there for when they are wanted.
- **Every phone number is both diallable and copyable.** The number itself is a `tel:` link, so tapping it starts a call on the phone, and a Copy button sits beside it. Email and reference get Copy only. `Copy` becomes `Copied` only when `navigator.clipboard` confirms the write; if the browser refuses (an insecure context, an unfocused document) the popup says so and tells the user to select the text, rather than claiming a success it did not see.
- **Phone numbers are free text, and the code treats them that way.** `src/lib/contacts/contact-links.ts` strips spaces, hyphens, brackets and dots and keeps a leading `+`, so `"0121 000 0000"` dials as `tel:01210000000`. If fewer than three digits survive — “ask at the desk” — there is no link at all, just Copy. The helper is a module with nine unit tests rather than logic inside the component, because the awkward inputs are the whole problem and there is no browser to click through them.
- **Only a live contact opens.** `orgName()` resolves a name from `data.deletedOrganisations` too, so a binned contact's tasks still read properly; `taskRow` now asks `liveOrganisation()` as well, and renders plain text when there is no live record. “No organisation” stays plain text for the same reason. This is the sharp edge that would otherwise have invited the user to tap a name with nothing behind it.
- **No new data path.** Everything the popup reads is already in `Snapshot["organisations"]`, so there is **no server action, no store change, no migration, and no extra request** — the v0.2.6 upgrade, like v0.2.5, is an image swap only. `Workspace` keeps just the organisation id in `contactQuickView`, so the popup shows the latest snapshot if the other user edits the contact while it is open, and closes itself if the contact is binned.
- The name is a real `<button>` with an accessible name (`Contact details for …`), an underline and an icon as well as colour, a hover state, the app's focus ring, and a tap area widened by negative margins without moving the text. In the popup, the number links and copy buttons are 44px tall, because the realistic use is on a phone.

Verified:

- **70 unit/integration tests** (61 before), `tsc --noEmit`, `prettier --check` and `next build` all pass. The nine new tests are `tests/contact-links.test.ts`; no database is needed for them.
- A temporary server-render harness rendered the real `Workspace` against the demo database four ways and asserted 46 things in total, presence and absence together: the tappable name on a row; the open popup with `tel:01210000000` and `tel:+441210000000` beside the numbers as typed, one copy button per value, the four contact-screen labels, and **no notes**; a contact with nothing added, showing “Not added” and offering no dial link; and a **binned contact's name not tappable** while other contacts stay tappable. The harness was deleted after use, as always.
- `curl` against the development server confirms the row markup is served (`task-org`, `Contact details for Barclays Estate Accounts (fictional)`) and the page still returns 200.
- The real clipboard, the `tel:` handoff and the look of the popup on a phone can only be judged in a browser. `npx playwright install chromium` still cannot download one here, so the user tries it in the Arena preview before merge.

Demo data:

- `scripts/seed-demo-contacts.ts` was added because the demo contacts previously had no details at all, which left the popup nothing to show. It writes three fictional contacts and one task each — all fields with two number formats; one phone number only; nothing added — and refuses a database path without `demo` in it, as the finances seed does.

Not covered here:

- Making contact names tappable on finance rows, note rows, document rows or reimbursement lines, and any change to the contact screen itself — all agreed out of scope for this pass, not deferred bugs. (The document rows and the contact screen were taken up in v0.2.7; finance rows, note rows and reimbursement lines remain out of scope.)
- The published image is built by GitHub Actions from the tag, not in the sandbox.
- The accessibility and security review is still the outstanding item from the release gate; this change follows the app's existing focus, contrast-with-text and tap-target rules but does not substitute for that review.

## v0.2.7 checkpoint — contact popups on document rows, and dial/copy on the contact screen (17 September 2026)

Decided with the user before building:

- **Document rows (option A1).** Each _directly linked_ contact name becomes its own tappable item; note, task and project names on that line stay plain text. A contact reached only through a linked note or task is not shown — the row shows direct links, exactly as before, and the contact screen keeps the wider aggregation.
- **Contact list rows.** The user asked to keep the current behaviour: the row stays one big button and tapping it opens the full contact. The dial and copy controls therefore go onto the contact screen itself, not onto the list — no restructure of an approved layout.

Implemented:

- **The contact popup now also opens from document rows.** A document's directly linked live contact names are `.task-org` buttons — the same button, accessible name, hover and focus treatment as the task row. The popup is the same component; it gained a `closeLabel` so the close button reads **Back to documents** there and **Back to the task** elsewhere. "Open full contact" is unchanged.
- **The contact screen offers the dial and copy controls directly.** Its plain field list was replaced by the same shared field list the popup renders (`ContactFieldList`): Main contact, Phone numbers, Email, Account / reference, in the contact screen's order, each number a `tel:` dial link with its own Copy button, Copy beside the other values, "Not added" for an empty field, and the same copy-state line. One shared component for both places means the information cannot drift apart; the values stay selectable for the select-and-copy fallback.
- **The document row's link line is resolved by a pure function** (`documentLinkItems` in `src/lib/contacts/document-links.ts`): a live contact is a tappable item, a binned contact is plain text with its name, a note or task is its title, a project its name, and a link to a financial record only produces nothing — the pre-existing quirk carried over, not fixed, and pinned by a unit test.
- **No server action, no store change, no migration, no extra request.** Everything is already in the browser in the snapshot, so the release is an image swap only, as with v0.2.5 and v0.2.6. `Workspace` still holds only the organisation id in `contactQuickView`, so the popup follows edits and closes itself if the contact is binned.

Verified:

- **83 unit/integration tests** (70 before), `tsc --noEmit`, `prettier --check` and `next build` all pass. The thirteen new tests are `tests/document-links.test.ts`; no database is needed for them.
- A temporary server-render harness rendered the real `Workspace` against the demo database six ways and asserted 54 things in total, presence and absence together: the document rows with the three tappable names (a document linked to one contact, one to two) and the note title as plain text, plus the "No links yet" line for an unlinked document; the popup over the documents with both `tel:` hrefs, one copy button per value, the four labels in order, no "Copied" before a copy, and **Back to documents** rather than Back to the task; the contacts list where every row is still one button with no nested button or link and no dial or copy control anywhere; the contact screen for the fully filled-in contact with both dial links, five copy buttons and the notes still shown below; the same screen for the nothing-added contact with four "Not added", no dial links and no copy buttons; and a **binned contact's name not tappable** while the other contact stays tappable. The harness was deleted after use, as always.
- The contact list markup was checked, not assumed: the rows are unchanged buttons, so the approved layout is untouched. `curl` against the development server confirms the page and its stylesheet still serve; the real clipboard, the `tel:` handoff and the phone look can only be judged in a browser, so the user tries it in the Arena preview before merge.

Demo data:

- `scripts/seed-demo-documents.ts` adds three fictional documents with small generated PNGs — one linked to one contact, one to two, one only through a note — so the Documents tab and its popups can be exercised. It writes the files into the demo documents folder only, records a size matching the bytes actually written, needs the contacts seed first, and refuses a database path without `demo` in it.

Not covered here:

- Contact names on finance rows, note rows or reimbursement lines — still out of scope, as agreed.
- A document whose only link is a financial record still reads "No links yet" on the Documents row (pre-existing quirk, deliberately left and now pinned by a test).
- The published image is built by GitHub Actions from the tag, not in the sandbox.
- The accessibility and security review is still the outstanding item from the release gate; this change adds more interactive controls, follows the app's existing focus, contrast-with-text and tap-target rules, and does not substitute for that review.

## v0.2.8 checkpoint — an Event log tab, and a project on the interaction (18 September 2026)

Decided with the user before building:

- **Placement and order.** The Event log sits between Documents and Unfiled notes, most recent first, with a **Reset filters** button that is disabled when the filters are already at their defaults.
- **One project at most**, like a task — not the multi-project checkboxes a contact gets.

Implemented:

- **A new Event log tab over every interaction.** Calls, emails, letters, web forms and quick notes read as one list, most recent first, whether or not they have a contact. A search box matches every word against the title and detail together; four dropdowns filter by Organisation (including No organisation), Project (including No project), Type and Recorded by, with an order toggle for newest- or oldest-first; leaving the tab resets all six, and **Reset filters** does the same without leaving. Each row carries the kind as an icon plus a text badge (never colour or icon alone), the title, the contact name — tappable when the contact is live, plain “No organisation” or a plain binned name otherwise — the project name or “No project”, the time in Europe/London with “Recorded by” attribution, and Edit/History/Bin. The empty states distinguish “no events yet” (with a Log button) from “no matching events”.
- **One optional project on the interaction.** The interaction dialog gained a Project dropdown — No project, then every project — on create and on edit, preselected when the interaction already has one. Saving refuses an unknown or binned project; permanently deleting a project clears the link and keeps the interaction; restoring an interaction whose project is binned is refused with “The linked project is in the bin. Restore it first.” Nothing is backfilled: records saved before v0.2.8 validate with the link missing, exactly like a stored null.
- **Migration `0006_event_log_project_link`.** A nullable `interactions.project_id` with a foreign key to `projects`, applied automatically at startup like the other migrations; existing rows are untouched.
- **The same contact popup from event rows.** The popup is the same component; its close button reads **Back to the event log** there, **Back to documents** from the Documents tab, and **Back to the task** elsewhere. The contact list rows are untouched: still one button that opens the contact, with no nested control.

Verified:

- **87 unit/integration tests** (83 before), `tsc --noEmit`, `prettier --check` and `next build` all pass. The four new tests are in `tests/records.test.ts` and cover the project link from both directions: refused on save, cleared on permanent project deletion, and blocking a restore.
- A temporary server-render harness rendered the real `Workspace` against the demo database four ways and asserted 56 things in total, presence and absence together: the event list with one search box, five dropdowns and one disabled-at-defaults Reset, nine rows newest first (a second harness run after the toolbar rework asserted 24 more: the narrowed search, four capped dropdowns, the order toggle and Reset moved up, and no Order dropdown) with text kind badges, tappable contacts, project names, London times and “Recorded by”, nine Edit/History/Bin sets, and the nav sitting after Documents and before Unfiled notes with no other view's markup rendered; the popup over the event log closing with **Back to the event log** and no other close label; the contacts list still three single buttons with no nested popup button and no Copy; and the interaction create form offering No project, the edit form preselecting the linked project, and the history resolving the Project caption to its name. The harness was deleted after use, as always.
- `curl` against the development server confirms the page still returns 200. The look of the log, the filters and the popup on a phone can only be judged in a browser, so the user tries it in the Arena preview before merge.

Demo data:

- `scripts/seed-demo-events.ts` writes nine fictional interactions across all five kinds — a call, an email, a letter, a web form and a note for each recorder mix, with contacts and projects present and missing — so the list, the search and every filter have something to show. One shares its title with a seeded document. It is idempotent and refuses a database path without `demo` in it, as the other seeds do.

Not covered here:

- Contact names on finance rows, unfiled-note rows or reimbursement lines — still plain text, as agreed; only task, document and event rows open the popup.
- A document whose only link is a financial record still reads “No links yet” on the Documents row (pre-existing quirk, deliberately left and pinned by a test).
- The published image is built by GitHub Actions from the tag, not in the sandbox.
- The accessibility and security review is still the outstanding item from the release gate; this change follows the app's existing focus, contrast-with-text and tap-target rules but does not substitute for that review.

## v0.2.9 checkpoint — a map link on contacts, a Notes label, and kind icons on interaction cards (18 September 2026)

Decided with the user before building:

- **The map link is typed in by hand.** There is no address field, and deriving a location from the notes would be a guess, so the field stores exactly what the user pastes — validated only as an http(s) address of sane length, because the link opens in a new tab.
- **The idle help line goes, both halves of it.** “Tapping the number starts a call on this device.” and “Nothing here is dialable as typed – copy it instead.” were one idle help text; a tappable number explains itself. The two transient messages — “Copied – paste it wherever you need it.” and the refused-copy explanation — stay, because they answer an action the user just took. Idle, the line renders nothing.
- **The icons follow the Event log, on both lists.** The contact screen's Interaction history and Unfiled notes share `noteCard`, so changing the shared card keeps the two lists and the Event log reading alike, from one `eventKindIcons` map. Icon and word together, never the icon alone.

Implemented:

- **A map link on each contact.** `organisations.map_url` (migration `0007_contact_map_link`, nullable, nothing backfilled), an optional Map link input on the organisation form, and a fifth row in the shared `ContactFieldList`: a tappable **Open map** (`target="_blank"`, `rel="noreferrer"`) with the standard copy button, “Not added” when empty — so the popup and the contact screen show the same thing and cannot drift. Validation refuses a bare domain, plain words, a non-http scheme and an unparseable address with “Enter a link that starts with http:// or https://”; a payload with no `mapUrl` key still validates, so contacts saved before v0.2.9 are untouched. History captions the column “Map link”.
- **The Notes label.** The contact screen's free-text notes sit under a **Notes** heading, inside the same conditional, so a contact without notes shows neither.
- **Kind icons on interaction cards.** `noteCard` leads with the Event log's `.task-icon` box and the same icon at 18px, the icon box's top edge level with the title's; the kind in words stays as the chip in the line under the title. The dial/link style is now `.contact-link` (was `.contact-call`) because a map link shares it, and `.note-head` holds the icon beside the title.

Verified:

- **89 unit/integration tests** (87 before), `tsc --noEmit`, `prettier --check` and `next build` all pass. The two new tests are in `tests/records.test.ts` and cover the map link's validation and its save–change–clear history round trip.
- A temporary server-render harness rendered the real `Workspace` against the demo database in six states — the contact screen with a map link and notes, the same contact in the popup, a contact with no map link, that contact with its notes removed, Unfiled notes and the Event log — asserting presence and absence together: the fifth row with **Open map**, the new-tab attributes and the copy button; “Not added” and no copy button where nothing is stored; the **Notes** heading present with notes and gone without; neither idle help sentence nor an idle status paragraph anywhere; the icon box, its icon and the kind in words on every interaction card; and the two kept copy messages still rendering, confirmed and refused, by forcing the copy state. A negative control proved the assertions bite. The harness was deleted after use, as always.
- `curl` against the development server confirms the page and `/api/health` return 200, and the served stylesheet and script chunk carry the new rules. The look of the row, the label and the icons on a phone can only be judged in a browser, so the user tried them in the Arena preview before merge — which is also how the icons' first, too-faint placement was caught and corrected to the Event log's box.

Demo data:

- `scripts/seed-demo-contacts.ts` gives the fully filled fictional contact a Google Maps link in the documented link format, pointed at a fictional street; the other two contacts keep the row empty so “Not added” can be seen. Idempotent, and refusing any database path without `demo` in it, as before.

Not covered here:

- **Sharing a document** (the device's share sheet, so a file can reach Gmail or WhatsApp) was carried forward again: it can only be proven on a real device, and must not hold up a release that is otherwise ready. Still outstanding after v0.2.10 — see the v0.2.10 checkpoint.
- The published image is built by GitHub Actions from the tag, not in the sandbox.
- The accessibility and security review is still the outstanding item from the release gate; this change follows the app's existing focus, contrast-with-text and tap-target rules but does not substitute for that review.

## v0.2.10 checkpoint — contacts sorting, task outcomes, and Scheduled (19 September 2026)

Decided with the user before building, and in two rounds of looking at the running demo:

- **The Assigned to request was not the filter at all.** The handover recorded it as wanting an "All" option in the task list's Assigned to filter, which already began with **Everyone**. Shown the real dropdown, the user meant the _task form's_ assignee list, and meant something the handover had ruled out as meaningless: a value for work the two of them have to do together — "attend a meeting together" was their example. So Everyone is a stored value of its own, not an alias for either person, and a task carrying it appears under each user's filter but never under Unassigned.
- **The Waiting rename needed a data migration.** The word lives in stored rows and not only on screen, so renaming it to Scheduled is an `UPDATE` as well as a list change. `drizzle-kit generate` emits nothing for it — `tasks.status` is plain TEXT with no database enum — so that statement is hand-written into `0008` after the generated column additions. Old revisions keep the word _Waiting_, because that is what they recorded at the time; rewriting them would make the history lie.
- **Create interaction belongs in the Edit Task window**, not on the task row and not offered the moment a task is marked Done. It saves the task as it stands and then opens the ordinary interaction editor, so nothing reaches the event log until the interaction is saved.
- **The generated interaction is dated now, not the task's due date.** The due date would be a guess whenever a task is logged late or early, and a guess on a real estate record is worth avoiding. The field is editable in the interaction anyway.
- **The interaction is left unlinked to the task.** It stands on its own, exactly as if it had been typed by hand — editable, bin-able, in the Event log and in history. A column pointing back was offered and declined.
- **The two boxes are Task Start and Task Outcome**, and **Task Start is locked once a task exists.** The user asked for the lock themselves: the start of a task is a record of what was asked for at the time, not a running note, so it should not be quietly rewritten weeks later — with a padlock beside the label for when something genuinely needs correcting.
- **Sorting became one menu, not two toggles.** The user chose Added order / A>Z / Newest first in a single menu over two mutually exclusive toggles, which also makes the default visible instead of implied.

Implemented:

- **Contacts sorting and filtering.** A Sort menu beside the search box and a **Hide resolved** toggle beside it. Added order is the list as it comes back from the database, and is what the list opens in. Hide resolved reads **Hide resolved** when off and **Show resolved (2)** when on, counting resolved contacts across the whole list rather than only the current search, so the number is what the filter takes away from the list as a whole. The rows are built from one `matches` → `visible` pass, so search, the resolved filter and the chosen order compose without ever reordering the snapshot the rest of the screen reads. Contact rows already carried a Resolved badge, so nothing was added there — the handover's note that they showed no status was out of date.
- **A type on the task.** `taskKinds` — Call, Email, Meeting, Research, Review — as an optional dropdown, shown on the row as an icon with the word beside it, and recorded in the task's history. Optional, so every task saved before this release validates untouched.
- **Task Start and Task Outcome**, kept apart so that recording what came of a call never overwrites the reason it was made. Task Start opens locked on a task that already exists, `readOnly` rather than `disabled` because a disabled field is left out of the submitted form and would quietly clear it, with a padlock reading **Locked** or **Unlocked** so the state is not left to the icon alone. A new task has nothing to lock and shows no padlock.
- **Create interaction**, which saves the task and opens the interaction editor pre-filled from it. `Editor` gained an optional `initial` map that `RecordForm` falls back to when no existing record is being edited, so the contact, project, title, outcome and kind all arrive filled in — a Call task becoming a call, an Email task an email, and the rest a note — with every part still editable. The button is unavailable until an outcome exists, because an interaction cannot be saved without one.
- **Everyone**, stored as `everyoneAssignee` and let through the store's assignee check, which still refuses any other name outside the two configured users.
- **Needs attention** no longer appears on a task that is Done or Cancelled; an open overdue task still says it. The list's ordering was left alone — the user chose not to sink finished tasks to the bottom.

Verified:

- **94 unit/integration tests** (89 before), `tsc --noEmit`, `prettier --check` and `next build` all pass.
- A temporary server-render harness rendered the real `Workspace` against the demo database in eleven states — contacts in each of the three orders and with Hide resolved on, the tasks list at every status and filtered to each assignee, the task form for a new and an existing task, the interaction editor pre-filled from a task, and the lock in both states — asserting presence and absence together: A>Z alphabetical and Newest first the exact reverse of added order; the two resolved rows gone and the count in the button; **Done · Call** with no **Needs attention** beside an open overdue task that still says it; the shared task reading **Everyone** and appearing under Alex while staying out of Unassigned; the Sort menu's three options with Added order selected and no `aria-pressed` sort toggle left; Task Start `readOnly` with its value intact and the padlock reading Locked, then editable and reading Unlocked; and the interaction's title, outcome, kind, project, contact and date all arriving from the task. Every temporary edit to the view state was reverted and confirmed by comparing the diff hash before and after. The harness lived in `/tmp`, outside the repository, and was deleted after use.
- One bug was caught this way rather than in review: reading a live field with `instanceof HTMLInputElement` throws during server rendering, where those globals do not exist. The helper is duck-typed now.
- `curl` against the development server confirms the page returns 200. How the Sort menu sits beside the search box on a phone, and whether the padlock reads clearly at a glance, can only be judged in a browser, so the user tried them in the Arena preview before merge.

Demo data:

- `scripts/seed-demo-contacts.ts` now seeds six fictional contacts, two of them **resolved** so Hide resolved has something to count; one task of every type; an overdue task that is still open and a Done task with a past due date so both sides of the Needs attention rule sit side by side; an outcome on two finished tasks; and the solicitors' meeting assigned to **Everyone**. The seed's own status union now says `scheduled`. Idempotent, and refusing any database path without `demo` in it, as before.

Not covered here:

- **Sharing a document** through the device share sheet, so a file can reach Gmail or WhatsApp, is still outstanding: it can only be proven on a real device, and Chromium cannot even be downloaded in this sandbox. It remains independent of everything above and is the natural next candidate.
- The accessibility and security review is still the outstanding item from the release gate; this change follows the app's existing focus, contrast-with-text and tap-target rules but does not substitute for that review.
