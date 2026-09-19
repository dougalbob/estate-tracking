# Estate Organiser

> A calm, private web app to help two people navigate the logistics of settling a personal estate after the death of a parent.

## Current state — 19 September 2026

|                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live release                       | **v0.2.13** — receive a shared PDF or image from Android (for example Genius Scan → Share → Estate Organiser) straight into the existing Upload document dialog, with the file pre-selected and the friendly name pre-filled — built by GitHub Actions and published to GHCR as `v0.2.13`, `latest`, and a git-SHA tag. Until Unraid pulls the new image the server is still running **v0.2.12** |
| Earlier releases                   | v0.2.0 – v0.2.12, all published 16–19 September 2026                                                                                                                                                                                                                                                                                                                                                                             |
| Data in use                        | **Real estate records and real documents, entered by both users.** The installation runs on Unraid behind Cloudflare Access                                                                                                                                                                                                                                                                                                      |
| Verified in production             | Sign-in for both users; document upload; **encrypted backup created and restored, with the records confirmed afterwards**; the app installed on Android with the Cloudflare Access Bypass rules in place; the v0.2.6 contact popup used on a PC and a mobile phone against the live installation (17 September 2026)                                                                                                             |
| Verified by hand, not in a browser | The v0.2.5, v0.2.6, v0.2.7, v0.2.8, v0.2.9, v0.2.10, v0.2.11, v0.2.12 and v0.2.13 changes were checked by rendering the real components to markup and by HTTP against the development server; the sandbox has no browser, so no click-through test has ever run in one                                                                                                                                                                                     |
| Automated gates                    | 120 unit/integration tests, TypeScript, Prettier and the production build all pass on the released commit                                                                                                                                                                                                                                                                                                                         |
| Still outstanding                  | A full accessibility and security review, and four moderate audit findings in the development-only Drizzle/esbuild toolchain. There is deliberately no offline support                                                                                                                                                                                                                                                           |
| How to read the rest of this file  | Dated checkpoints and the original proposal are kept as a written record. Where the text below says something is planned or unverified, this table is the current position                                                                                                                                                                                                                                                       |

**Because the installation now holds real records**, every development and demo instruction in this file must be pointed at the isolated demo database, never at `/mnt/user/appdata/estate-organiser`.

**Keeping this file and the plan true.** These two documents are updated **in the same change, immediately before anything is merged** — not afterwards and not in a follow-up. If a change alters behaviour, the README and `docs/IMPLEMENTATION_PLAN.md` are corrected in that pull request, so a merge never leaves the written record describing something the app no longer does. A change with no visible behaviour difference (a refactor, a test-only edit) needs no wording change, but the pull request says so explicitly. This rule exists because the app was described inaccurately in earlier sessions — test counts, what had shipped, and what was still outstanding — and that is worse than no documentation at all.

## Status and purpose

**Core workflow, checklist templates, production container packaging, and encrypted backup/restore are implemented and in production use.** Organisations, interactions/quick notes, and tasks can be created and edited, with SQLite persistence, multiple linked follow-ups, user attribution, readable revision history, and conflicting-edit protection. A contact screen can attach a task that already exists, and the task or note dialog can create a contact that does not exist yet, so neither has to be done in a second pass. The contact name on a task row opens a small popup with its phone number, email and reference, with tap-to-dial and copy, so the details can be used without leaving the task; the same popup opens from a directly linked contact name on a document row, and the contact screen itself offers the same dial and copy controls on its fields. A contact can also carry a map link typed in by hand — never guessed from anything else on the record — which the popup and the contact screen both show as a tappable **Open map** opening in a new tab, with the usual copy button beside it; and the contact screen's free-text notes now sit under a **Notes** label. Interaction cards on a contact and in Unfiled notes lead with the same kind icon the Event log uses, in the same box, with the kind still spelled out in words. An **Event log** tab lists every call, email, letter, web form and quick note most recent first, with a search box, Organisation, Project, Type and Recorded by filters, and an order toggle for newest- or oldest-first; the contact name on an event row opens the same popup, and the interaction dialog links one optional project. A **Calendar** tab lays every task that has a due date out by month or by week, colour coded by project, with checkboxes for the statuses and for who the task is given to; clicking a task opens it, and dragging it to another day changes its due date. Projects can be created and renamed; organisations can belong to multiple projects while tasks and interactions have one optional project. Ordinary deletions go to a recoverable bin with restore and explicit permanent-deletion confirmation; deleting an organisation does not cascade-delete its notes or tasks. The overview shows saved tasks and the other user’s activity. The development preview saves fictional records in an isolated demo database. Documents, estate finances, and the three editable starter checklists are also implemented. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for delivery stages and acceptance criteria.

The goal is a polished release covering contacts, interactions, tasks, funeral arrangements, documents, and estate finances. Delivery is staged, but these are all core requirements. There was no existing data to import. Production verification is complete and the installation now holds real records, so any preview, experiment, or example in this file must use the isolated demo database instead.

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
- The **Calendar** tab sits in the sidebar between Projects and Estate finances. It colour codes tasks by project, and the colour is never the only cue: each task names its project in words, a task with no project has its own neutral tone and a dashed edge, and each day counts its tasks.
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

One record per organisation, with name, main contact name, phone number(s), email, account/reference details, an optional map link, and free-text notes. The map link is typed in by hand — any http or https address, kept exactly as entered — because there is no address field to derive one from, and a guess would be a guess. No separate people directory or multiple-account model is required.

The first five of those — main contact, phone numbers, email, account/reference and the map link — appear in the small popup that a task, document or event row's contact name opens, with the same labels and in the same order, so a number can be dialled, a map opened, or any value copied without leaving the list ([Tasks, dates, and projects](#tasks-dates-and-projects)). They are the contact screen's own field list too, with tap-to-dial numbers and copy buttons, because the popup and the contact screen render one shared component and cannot drift apart. The contact screen's notes sit under a **Notes** heading, shown only when there are notes to read.

Statuses: **Not Contacted → In Progress → Awaiting Response → Resolved**. Every row carries its status in words, so a Resolved contact is recognisable before the filter is used.

Status changes are manual and independent of tasks. Resolving an organisation with open tasks gives a warning; it does not close them. Organisations can link to multiple projects.

The contacts list has a **Sort** menu beside the search box — Added order, A>Z, or Newest first — and a **Hide resolved** filter beside it. Added order is what the list opens in: the order the contacts were added, oldest first. Hide resolved reads **Hide resolved** when it is off and **Show resolved (2)** when it is on, counting resolved contacts across the whole list rather than only the current search, so the number is what the filter takes away. Both work together, and the search keeps working on top of whichever order is chosen.

### Interaction history

Calls, emails, letters, and web forms can be logged against an organisation. Each interaction includes:

- Title and full detail.
- Interaction date/time, defaulting to now but editable for retrospective entries.
- Separate, automatically captured creation time and creating user.
- Optional attachments with friendly names.
- One optional project, like a task.
- Zero or more follow-up tasks, each with an action, optional owner, and relevant dates.

For example: create Bank1 and its reference details, log a call, attach a document, and create linked tasks to send a certificate and chase a reply. Follow-ups appear in the normal task list and on the home screen when relevant. Every interaction also appears in the **Event log** tab, most recent first, whether or not it has a contact.

### Linking work to a contact from either direction

A contact screen shows its linked tasks and documents together. **Link existing task** attaches a task that already exists, instead of adding another one:

- Only tasks with **no contact yet** are offered, so nothing is silently moved off another contact.
- Attaching one changes nothing else about the task — its title, detail, dates, assignee, project, documents and history all stay exactly as they were, and the change is recorded in the task history.
- A task that came from a note stays with the note's contact, because the note and its follow-up tasks must belong to the same organisation.
- If someone else edited the task while the picker was open, the link is refused rather than applied over their change, and the picker refreshes so it can be chosen again.

The reverse direction works too: the **Organisation** list in the task or note dialog includes **+ New contact…**, which reveals a name (required) plus an optional email and phone number. The contact is created and the record linked in a single save, so a failure cannot leave an orphan contact; the dialog keeps what was typed and says so plainly. Notes, reference details and projects can be filled in later from the Contacts tab. The same control appears in the note dialog, which is what makes "record the task first, sort the contact out later" a single step.

### Quick capture

Quick notes accept an optional title and free-text detail, with automatic time and user attribution. Organisation and attachments are optional. Unlinked notes appear in an **Unfiled notes** list and can be linked or given follow-up tasks later.

## Tasks, dates, and projects

- Tasks may stand alone, optionally link to an organisation and source interaction, and have one optional project.
- Assign to either user, to **Everyone**, or leave unassigned. Everyone is for work the two of you have to do together — attending a meeting, say — and is not the same as Unassigned: a task given to Everyone stays in view when the list is filtered to either person, and never appears under Unassigned.
- **A contact's details are one tap from the task.** On a task row the contact name is a button: it opens a small popup over the list with the main contact name, every phone number, the email, the account/reference and the map link. Tapping a phone number starts a call on the device, the map link opens in a new tab, and every value has a copy button beside it, so the number or reference can be pasted into another app. Nothing is saved by opening it and nothing is sent to the server — the details are already on the screen. It works the same on the Tasks tab and on the home screen, because both use the same row, and the same popup opens from a directly linked contact name on a document row, where the close button reads **Back to documents** ([Documents](#documents)), and from the contact name on an event row, where it reads **Back to the event log**.
  - The popup deliberately leaves notes out; **Open full contact** is beside it for when you want the rest.
  - A contact with a field not filled in still opens, and that field reads **“Not added”**, exactly as on the contact screen.
  - The map link reads **Open map** and opens in a new tab. With nothing stored the row reads “Not added” like the others, and a value that is not an http(s) address is refused when the contact is saved, with the field's plain message.
  - A phone number that is not really a number (say “ask at the desk”) gets a copy button and no dialling link, rather than a guess.
  - Copy says **“Copied”** only when the browser confirmed the write. If it refuses, the popup says so and tells you to select the text yourself.
  - A task with no contact keeps its “No organisation” label as plain text, and so does the name of a contact that is in the recoverable bin — there is no live record to show for it.
- **A linked document's name is tappable.** Where a task has documents attached, its row lists each one by friendly name; tapping a name opens it in the in-app viewer (images inline, PDFs in a frame, with a Download button inside), so a certificate or statement can be read without leaving the list. The same names behave the same way inside the task's edit dialog.
- States: **To do, In progress, Scheduled, Done, Cancelled**.
- Distinguish a **due date** (action needed), **follow-up date** (check/chase), and **confirmed deadline** (a firm date entered by a user).
- Scheduled tasks resurface on their follow-up date.
- A task whose dates have passed is marked **Needs attention**, but a task that is **Done** or **Cancelled** is not: a finished task awaits nothing, however far in the past its dates have fallen.
- A task has an optional **type** — Call, Email, Meeting, Research or Review — shown on the row as an icon with the word beside it, and recorded in the task's history. Types saved before this existed simply have none.
- A task carries two pieces of text: **Task Start**, what is being asked for, and **Task Outcome**, what happened once it happened. Keeping them apart means recording what came of a call never overwrites the reason it was made. On a task that already exists, Task Start opens locked — it is a record of what was asked for at the time, not a running note — with a padlock beside the label that reads **Locked** or **Unlocked** and unlocks it when something genuinely needs correcting. It is locked rather than hidden, so the words can still be read. A brand new task has nothing to lock yet and shows no padlock.
- **Create interaction**, in a task's edit dialog, saves the task and then opens the ordinary interaction editor for the same contact with the title, project, type and outcome already filled in: a Call task becomes a call, an Email task an email, and the rest become a note. Nothing reaches the event log until that interaction is saved, and every part of it can be changed first. The button is unavailable until an outcome has been written, because an interaction cannot be saved without one. The interaction stands on its own afterwards, exactly as if it had been typed by hand.
- No automatic calculation of legal deadlines.
- Reminders are in-app only; no email or browser/push notifications.
- **Projects collapse and expand** from the title row, so a long list can be scanned quickly. Collapsed is per-panel, starts expanded, and hides everything below the heading — organisation pills, documents, checklist and tasks — leaving just the title row. The control is a small button with a chevron before the project name, with an accessible name and `aria-expanded`.
- Each project has a **Hide Done** filter that hides tasks whose status is Done in that project. When off it reads **Hide Done**, when on **Show Done (2)** with the count of done tasks in that project, using the same Eye/EyeOff, variant and `aria-pressed` pattern as the contacts **Hide resolved** filter. The summary line stays the true total, so hiding never looks like deletion. When every task in a project is done and hidden, the empty state reads “Every task in this project is done, so the list is empty while done tasks are hidden.” rather than “No tasks assigned to this project yet.”
- The **All tasks** list has a **Hide Done/Scheduled** filter in the filter bar that hides tasks whose status is Done or Scheduled from the otherwise-filtered set — search, Status and Assigned to still apply, and the count is what the toggle itself removes. When off **Hide Done/Scheduled**, when on **Show Done/Scheduled (3)** with that count, using `/` in both states. Cancelled is not included — it stays visible unless the Status filter excludes it. At the default **Open tasks**, Done is already excluded, so the toggle's only new effect there is hiding Scheduled; on **All statuses** it hides both.

- **The Calendar tab shows every task with a due date, and nothing else.** A follow-up date or a confirmed deadline does not put a task on a day, and a task with no due date stays in the All tasks list. In progress and cancelled tasks never appear, because the boxes offered are To Do, Scheduled and Done; they stay in All tasks, where the status menu still finds them.
- Tasks are **colour coded by project**: six calm tones, with the three starter projects keeping the same tone every time the page is opened and projects added later taking the next free one, cycling once all six are in use. A task with no project takes a neutral tone and a dashed edge. Each task also carries its project, its assignee and — in the week view — its status in words beside the colour, and an overdue task that is still open reads **Needs attention** there, exactly as it does in the task list.
- Two groups of checkboxes narrow the list: **Status** (To Do, Scheduled, Done) and **Assigned to** (each user, **Everyone**, **Unassigned**), all ticked to start. A search box narrows it again by title, and **Reset filters** is disabled until something has changed. A task given to both of you sits under **Everyone** alone, so unticking Everyone hides exactly the shared tasks and nothing else. Unticking every box shows nothing rather than everything.
- **Clicking a task opens it** in the same dialog the All tasks list uses, so the date can be read or corrected there.
- **Dragging a task to another day changes its due date and nothing else**: the follow-up date, the confirmed deadline, the assignment and the project are all left alone, and the move is written to the task's history like any other edit. The drag sends the version the page was showing, so a calendar left open while the other person edits that task is refused with a plain message and refreshed rather than overwriting their change, and dropping a task back on the day it is already on writes nothing at all. It uses the browser's own drag and drop with no new library, which makes it a desktop affordance: on a phone, tap the task and edit its Due date, which is what the task's own tooltip says.
- The page carries no running commentary — no standing explanation of the rules above and no count of what is on show, because the boxes and the grid say it plainly enough and the space is better left to the days. It speaks only where an empty grid would look like a mistake: “No tasks match these filters.”, or “Nothing in December 2026. 4 tasks match your filters on other days.” Today is marked with an outline and the word **Today**. The **Today** button is always clickable rather than disabled while the current month is on show, because a disabled button in this app shows the wait cursor and reads as something spinning.

Starter projects are **Funeral**, **Notifications**, and **Probate & Estate Administration**. Users may rename them and create more, such as House Clearance. Contacts and documents may link to multiple projects; tasks, interactions and financial records have one optional project.

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
- A document's directly linked contact names are buttons on its row: each opens the same contact popup a task or event row opens, so a number can be dialled or copied without leaving the list. Note, task and project names on that line stay plain text, and so does a contact in the recoverable bin — the row shows direct links, as before.
- Search by name, category, and associated records; no OCR or content search is required.
- Removing a link must not delete the underlying document or its other links.
- All document access requires the same authorisation as the rest of the app.
- On Android, a PDF or image shared from another app (for example a scan from Genius Scan, or a file from Files, Drive, Gmail or Photos) appears in the system share sheet as **Estate Organiser** when the app is installed. Choosing it opens the existing Upload document dialog with the file pre-selected and the friendly name pre-filled from the file name; the category and link can be chosen before pressing **Upload**. Nothing is saved until **Upload** is pressed and posts to `POST /api/documents/upload`. Supported types are PDF, JPEG, PNG, WebP, TIFF, HEIC/HEIF and text; other types are refused with a plain sentence, a file larger than 20 MB is refused, and when several files are shared only the first supported file is used with a note that the others were ignored. iPhone is not in scope — Safari has no Web Share Target — so the existing file picker stays in place.

### Document upload troubleshooting (production)

Uploads are limited to 20 MB per file (`maxDocumentSizeBytes`) and the server allows 25 MB request bodies (`experimental.serverActions.bodySizeLimit` in `next.config.ts` + a dedicated `/api/documents/upload` route that streams multipart bodies and avoids the Server Actions 1 MB default). If an upload fails:

1. **Retry an upload** — if it fails, the dialog now shows the error instead of hanging. Client-side size is checked before sending, and the dialog catches network/server errors with a message.
2. **Container logs** at the moment of the attempt: `docker logs estate-organiser` – look for `[upload]` or `[upload:api]` lines with file name, size, and write result. `ENOSPC` means disk full, other codes point at permission/storage issues.
3. **Free space** on the data volume: `df -h /mnt/user/appdata/estate-organiser` — a full disk fails uploads specifically while other saves still work. The server now returns `507` with a disk-full message when `ENOSPC` is detected.
4. **Small file vs large file** — upload a tiny text file first. If small works but large fails, you are hitting a body-size limit: check `next.config.ts` has `experimental.serverActions.bodySizeLimit: "25mb"` (it must be nested under `experimental` – a top-level `serverActions` key is not valid in Next 16 and fails the build with `TS2353`), rebuild the image, and Force Update on Unraid. The `/api/documents/upload` route handler also bypasses the Server Actions limit.
5. **Browser DevTools → Network** on a failed attempt: `413` = body too big (increase limit or compress scan), `502/504` = Cloudflare Tunnel or edge trouble (check tunnel status, `docker logs`, and retry), _no response_ / `failed to fetch` = a stall or connectivity drop (retry, check tunnel logs, and container health at `/api/health`).

Common fixes after an image update: ensure `public/` is copied in the Dockerfile runtime stage (PWA assets), `next.config.ts` is present in the runtime image (it is copied from the build stage), and the container was Force Updated after the release.

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
- **Receipts are attached from the record itself.** When adding a financial record you can choose a file and/or pick a document already stored, and they are attached as the record saves. Editing a record shows its receipts with View, Download and Remove link, and offers "Upload a receipt" and "Link an existing document". The record is saved first and receipts afterwards: if an attachment fails you are told plainly, the figures you entered are never lost, and you can add the receipt again from Edit. Removing a link removes only that link — the file and its other links stay.
- A row that has documents shows them as a marked count (a paperclip and "1 document"), so a receipt filed against a payment is not missed. The same marker appears on task rows.
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

**Verified in production, 17 September 2026:** an encrypted backup was created and then restored on the live installation through the published image, and the records were confirmed afterwards. The app creates a consistent SQLite snapshot, includes the documents folder, encrypts the bundle with a user-managed recovery password, validates the authenticated backup before replacement, and keeps no server-side retention copy after download. A raw copy of a live SQLite file is not an adequate backup strategy because this app uses WAL mode.

### Backup and restore workflow

Open **Backup & restore** in the workspace. Why the password is entered in the form: it is used only for this operation, is never stored by the app, and is not placed in a URL or log. Why the file is versioned and authenticated: a wrong password, damaged file, or tampered archive must fail rather than produce a plausible partial restore.

- **Create encrypted backup:** enter a recovery password of at least 12 characters. The server uses SQLite's online backup API while holding a write lock, copies the database snapshot and every regular file below `/data/documents`, then encrypts a versioned bundle with scrypt-derived AES-256-GCM. The browser receives an `.estate-backup` download; Arena may still block the final save action, but the HTTP response and encrypted bytes can be tested independently.
- **Restore backup:** choose an `.estate-backup` file and enter the same recovery password. The server authenticates and decrypts the whole archive into staging, checks its metadata and SQLite integrity, then replaces the database and documents. A failed validation leaves the existing installation in place. Restoring is destructive, so the UI asks for confirmation first.
- **Retention:** the application deliberately retains no completed backup on Unraid. Keep dated copies on the user's own device/cloud storage, keep the password separately, and retain more than one known-good copy. Scheduled transfer is not part of this first workflow.
- **Restore testing:** local automated tests cover a fictional database, nested documents, wrong passwords, archive validation, and a clean restore. On 17 September 2026 the same exercise was completed against the published image on the live installation and the records were confirmed. Real records are now in use, so re-test a restore after any change to the backup format, and always keep more than one known-good dated copy.

### Deployment files

- `Dockerfile` is a multi-stage Node 22 image. The build stage installs `python3`, `make`, and `g++` so `better-sqlite3` can compile if a platform-specific prebuilt binary is unavailable; the runtime stage contains only production dependencies, the built Next.js app, migrations, and the plain-JavaScript migration runner.
- `docker-entrypoint.sh` loads `/data/estate.env` if present, runs migrations, and starts Next.js on the container's `0.0.0.0:3000`.
- `compose.yaml` is a portable reference using the same GHCR image, host port `3005` mapped to container port `3000`, and the `/mnt/user/appdata/estate-organiser:/data` mapping.
- `estate-organiser.xml` is the Unraid user-template import. It defines the `/data` mapping, host port `3005` to container port `3000`, bridge network, and WebUI link.
- `src/app/api/backup/` and `src/lib/backup/` provide authenticated encrypted download/restore with a versioned archive format; the workspace exposes it under **Backup & restore**.
- `src/app/api/documents/upload/route.ts` streams multipart uploads so a file is not bound by the 1 MB Server Action default, and `next.config.ts` raises the body limit to 25 MB under `experimental.serverActions`. The browser prefers that route and falls back to the `uploadDocument` action.
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

6. **Complete the end-to-end check with fictional data.** Visit the public hostname, sign in with each allowed Google account, confirm that both can see the protected workspace, create a clearly fictional organisation and task, reload, and confirm persistence. Check `/api/health` from the LAN, upload a fictional document, create an encrypted backup, and confirm that an unauthenticated/private-window request to its document download URL fails. Delete the fictional rows afterwards. The restore exercise that this step used to wait for was completed on 17 September 2026, and the installation now holds real records — so a new installation should replace fictional data with real records only after the same restore check has been repeated there.

### Release and update flow

Before anything is merged, this file and `docs/IMPLEMENTATION_PLAN.md` are corrected to match the change (see **Keeping this file and the plan true** above). Then merge the change to `main`, then create and push a version tag such as `v0.2.9`. That tag triggers GitHub Actions to build the image and publish the version, `latest`, and SHA tags to GHCR. The package is set to **Public** in GitHub → Packages → `estate-organiser` → Package settings, because Unraid is intentionally configured to pull anonymously and no registry credentials belong on the server. In Unraid, use Docker → the container's menu → Force Update to pull the new `latest` image. The persistent `/data` mapping keeps the database, documents, and `estate.env` across the replacement.

The workflow can also be started manually with `workflow_dispatch`, which publishes `latest` and the current SHA. The image cannot be built in the Arena sandbox because no Docker daemon is available, so GitHub Actions is the only builder: the first image was published at v0.2.0 and every release since, up to v0.2.13, has been built there.

**If a release build fails, nothing is broken and nothing is released.** No image is pushed for the failed tag and `latest` does not move, so the running installation is untouched. Fix the cause on a working branch, open a pull request and merge it to `main`, then re-point the same tag at the new merge commit and force-push it — which is safe _only_ because no image was published for that tag:

```bash
git fetch origin main
git tag -f -a v0.2.9 -m "v0.2.9 – <what changed>" origin/main
git push -f origin v0.2.9
```

Then confirm the workflow succeeded and that the tags really exist on the published package:

```bash
gh run watch $(gh run list --workflow=publish.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
gh api "/users/dougalbob/packages/container/estate-organiser/versions?per_page=3" \
  --jq '.[] | "\(.metadata.container.tags|join(","))  created:\(.created_at)"'
```

## Installable PWA (Android)

The app ships a web app manifest (`src/app/manifest.ts`, served at `/manifest.webmanifest`), a service worker (`public/sw.js`, registered from `src/app/layout.tsx`), and two PNG icons plus an Apple touch icon in `public/`. It is installable on Android Chrome as a standalone app, and it has been installed that way on the user's phone; the manifest declares a `share_target` so the installed app appears in the Android share sheet for PDFs and images. The Dockerfile copies `public/` into the runtime stage, which the install needs. There is **no offline support** — the service worker only (a) takes control so Chrome shows the install prompt and (b) intercepts `POST /share-target` from a share: it reads the shared file from the form, stores it in the `estate-share-incoming` Cache under `/__share-incoming__/file`, and redirects with `303` to `/?share-target=1`. Every other request — pages, APIs, uploads — still goes through Cloudflare Access with no caching, and the page consumes the cached file once, opens the existing Upload document dialog with the file pre-selected, and deletes the cache entry.

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

> Important: on Unraid you must **Force Update** to pull the new image after a release. And the Cloudflare Access Bypass policy must be in place **before** a user can install the PWA on Android — otherwise the install banner will not appear, because the manifest cannot be fetched pre-auth. On this installation both of these are done: the policy is configured and the app is installed on the user's phone.

> The `share_target` is part of the installed manifest. After the v0.2.13 image is pulled, the app must be reinstalled on the phone (uninstall the PWA, then install again) for the share sheet entry to appear — a PWA installed before this change does not gain a new share target until it is reinstalled.

## Technology — the original proposal, and what actually shipped

This section is kept as a record of the pre-scaffolding plan. The right-hand column is what the running app uses today.

| Layer               | Proposed before scaffolding                                        | Shipped                                                                                           |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Framework           | Next.js 15 App Router, patched version to be checked at build time | Next.js **16.3.5** App Router                                                                     |
| Language            | TypeScript                                                         | TypeScript, strict, checked on every build                                                        |
| ORM                 | Drizzle                                                            | Drizzle ORM with versioned SQL migrations in `drizzle/`                                           |
| Database            | SQLite (`better-sqlite3`)                                          | SQLite via `better-sqlite3` in WAL mode                                                           |
| Styling             | Tailwind CSS with semantic CSS-variable theme tokens               | Tailwind CSS v4 with semantic tokens in `src/app/globals.css`                                     |
| UI components       | shadcn/ui                                                          | One shadcn/ui `Button` plus local components                                                      |
| Mobile installation | Web app manifest; no sensitive offline caching                     | Manifest with `share_target`, service worker (install + `POST /share-target` only) and icons; installed on Android, still no offline caching of pages or documents          |
| Authentication      | Server-verified Cloudflare Access JWTs                             | As proposed, plus an explicit development-only mock identity that cannot be enabled in production |
| Deployment          | Docker on Unraid                                                   | Multi-stage Node 22 image published to GHCR and run on Unraid, host port 3005                     |

Two changes from the original plan are worth recording. The proposal specified Next.js 15; the app was built on 16, where `serverActions` must be nested inside `experimental` in `next.config.ts` — a top-level key is not read and fails the production type check with `TS2353`. Offline support was dropped as a requirement, so no caching plugin was added; the service worker exists so Chrome offers the install prompt and to receive a shared file via the Web Share Target, with no other caching.

## Development

Requires Node.js 22 or newer.

```bash
npm ci
DATABASE_PATH=./data/demo.sqlite npm run db:migrate
# Fictional data only; never use this mode for real estate information
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-contacts.ts  # optional
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-documents.ts # optional, needs the contacts seed
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-events.ts    # optional
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-finances.ts   # optional
DATABASE_PATH=./data/demo.sqlite npx tsx scripts/seed-demo-calendar.ts   # optional
DEV_AUTH_ENABLED=true NEXT_TELEMETRY_DISABLED=1 npm run dev
```

The demo seeds are optional and idempotent. `seed-demo-contacts.ts` writes three fictional contacts with enough detail to exercise the popup on a task row — one with every field filled in, a fictional map link and two phone numbers typed in different formats, one with an email and reference missing, and one with nothing added at all — each with a task to hang it on. `seed-demo-documents.ts` (v0.2.7) writes three fictional documents with small generated images — one linked to a single contact, one to two contacts, one only through a note — so the Documents tab and its contact popups can be exercised; it needs the contacts seed first. `seed-demo-events.ts` (v0.2.8) writes nine fictional interactions across all five kinds, both recorders, and contacts and projects with and without — one sharing its title with a seeded document — so the Event log's search and filters can be exercised. `seed-demo-calendar.ts` (v0.2.12) writes thirteen fictional tasks with due dates counted from the day it is run, so the demo always has something in the current month: two tasks on one day, one already overdue, some further ahead and one next month, one each of In Progress and Cancelled (which the calendar never shows, so their absence can be checked) and one with no due date at all, which stays in All tasks. Because those tasks join the All tasks list too, the “(3)” in the v0.2.11 Hide Done/Scheduled example is what the contacts seed gives on its own. Like the other seeds, each refuses to run against a database path that does not contain `demo`.

In the Arena sandbox, use `npm ci --ignore-scripts`. The plain `npm ci` tries to compile `better-sqlite3` with node-gyp, which fails there, while `--ignore-scripts` uses the prebuilt binary that the package already ships and the unit suite runs normally. There is no Docker daemon in the sandbox, so the container image can only be built by GitHub Actions.

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

Project grouping, renaming, organisation-to-project links, collapse/expand and per-project Hide Done, the tasks Hide Done/Scheduled filter, and the recoverable bin (soft delete, restore, and explicit permanent deletion with retained history) are now available alongside the three starter projects. Document uploads with reusable links, estate finances in GBP as integer pence with CSV exports, the three editable starter checklists, encrypted backup/restore, Docker/Unraid packaging, the installable PWA and the published-image restore exercise are all done, and the app is in use with real records. Of the checks that this paragraph used to list as outstanding, only the full accessibility and security review remains.

Two habits are worth knowing when working on records. Linking a task that already exists to a contact changes only that task's contact, and only tasks that have no contact yet are offered, so nothing is silently moved off another contact. Creating a contact from inside a task or note dialog saves both in a single database transaction: if the record cannot be saved, the contact is not created either, and no orphan contact is left to tidy up by hand.

The contact popup on a task row is deliberately a view of data the browser already has (`data.organisations` in the snapshot): it adds no server action, no migration and no request. Its two pieces of new logic — diallable `tel:` forms and clipboard writes — live in `src/lib/contacts/contact-links.ts` as pure functions with unit tests, rather than inline in the component, because phone numbers are free text and the awkward cases are the ones that matter.

### Browser workflow test

With a development preview running, and only fictional data in use:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser test creates clearly named fictional records in the running demo app. It exercises two separate browser sessions, conflict recovery, resolution warnings, task completion, persistence after reload, and quick capture at phone width. `E2E_BASE_URL` can point to another development preview; `CHROMIUM_EXECUTABLE_PATH` can select an already installed compatible Chromium. Never point this test at a real estate installation.

Run `npm run format:check` for source formatting checks. The unit suite (120 tests) covers shared records, documents, checklist templates, finances, and encrypted backup/restore, including the GBP 500/200/300 reimbursement case, part payments, voids, CSV formula protection, document inclusion, clean restore, and wrong-password failure. It also covers the two controls added in v0.2.5: attaching an existing task to a contact (including a stale version being refused and a task that already belongs elsewhere not being moved) and creating a contact together with the task or note that needs it, in one transaction, with nothing left behind if the record cannot be saved. Nine of them, added in v0.2.6, cover the contact popup's helpers: phone numbers typed with spaces, hyphens, brackets or a leading `+`, a value that is not a number at all, and a clipboard that is missing, refuses, or accepts the write — so “Copied” is only ever reported when it is true. Thirteen of them, added in v0.2.7, cover the document row's link items: a directly linked live contact is tappable, a binned contact is plain text with its name, note, task and project names resolve to text in link order, unknown ids fall back to the app's plain names, and a link to a financial record only stays invisible, as before. Four of them, added in v0.2.8, cover the interaction's project link: an unknown or binned project is refused on save, permanently deleting a project unlinks the interaction instead of deleting it, and restoring an interaction whose project is binned is refused until the project is restored. Two of them, added in v0.2.9, cover the contact's map link: which addresses validate and which are refused with the plain message, and a save–change–clear round trip whose history records the link before and after each step while a refused save leaves the record's version untouched. Six of them, added in v0.2.10, cover what followed: a task's type saving, changing and clearing with each step in the history and an unknown type refused; Task Outcome surviving beside Task Start without either overwriting the other, and a task with no outcome storing null rather than an empty string; `scheduled` accepted and `waiting` refused outright; a task given to Everyone saving while a name outside the two users is still refused; and the migration itself, which replays history to `0007`, writes a row in the old spelling with raw SQL because the current schema already knows the new columns, lets `0008` run, then checks that the row reads `scheduled` with both new columns null and that an untouched `to_do` row never moved. Eighteen of them, added in v0.2.12, cover the calendar: which tasks belong on it at all (a due date, and one of the three statuses the boxes offer, so In Progress and Cancelled never appear); each status box hiding and showing its own tasks, with nothing ticked showing nothing; the assignee boxes separating the two users, Everyone and Unassigned, so a shared task sits under Everyone alone; the search narrowing by title and composing with the boxes; tasks grouped by day and read soonest first; the month drawn in whole Monday-first weeks — five for September 2026, six for August, with the neighbouring days marked and today marked once; the seven days of a week, the same week from any day in it; stepping through months without a 31st spilling into the next one, including a leap February; the plain-English month, week and day headings; each project keeping its own tone, a task with no project taking the neutral one and a binned project falling back rather than borrowing a colour; and moving a task's date — only the due date changing, the move written to the history as one change of date, a stale calendar refused with the conflict code, a drop back on the same day writing nothing at all, a binned task and an impossible date refused, and nobody outside the two users able to move it. Eight of them, added in v0.2.13, cover the share target helper: a PDF accepted and a Word file refused, the first of two PDFs taken, a Word file skipped for the next PDF, an empty share returning null, a file larger than 20 MB refused (including the boundary at exactly 20 MB where the next byte is refused), and case-insensitive extension handling.

Production dependency audit currently reports no vulnerabilities. The development-only Drizzle migration toolchain has four moderate audit findings through its older esbuild dependencies. These remain an explicit follow-up; do not expose its development tooling as a network service. The published-image Unraid/Cloudflare deployment and the clean production restore are verified; the browser accessibility and security review is still outstanding.

## Licence

Private / personal use. Not intended for public distribution at this time.
