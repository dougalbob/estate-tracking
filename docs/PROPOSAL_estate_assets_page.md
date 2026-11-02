# Proposal — the Estate finances page as a proper asset register

**Issue:** #29 "Improved Estate Finances page."
**Status:** discussion draft — nothing built yet.
**Date:** 2 November 2026

---

## 1. What the issue asks for

Reading #29, the asks break down into five things:

1. **Separate the two topics.** Probate is the legal story — who we contacted, why,
   what came back, what happens next. That is already well served by Contacts,
   interactions, tasks and the probate checklist. The _assets themselves_ — what the
   estate owns, what it is worth, what it realises, where it eventually goes — are a
   different subject and should stand on their own.
2. **Keep the three cards**, but let them carry more detail. They are a good summary
   of where things stand and are not the problem.
3. **Design for large tablet and laptop first.** The bulk of the time on this page is
   spent at a desk, not on a phone.
4. **A spreadsheet-style grid.** One row per record added by "Add financial record".
5. **Drill down in place.** A row expands to show that asset's notes and documents
   inline, plus an Edit action on the row. The expectation is 3–4 items per asset, so
   inline is manageable — no separate page, no modal for reading.

The issue text ends mid-sentence ("I"), so there is at least one more point the author
meant to make. It is worth getting that before the grid is built, in case it changes
the shape of it.

There is also an unstated sixth ask underneath the wording: _the eventual distribution
of the assets once the estate is settled_ should be visible. It is mentioned in
passing in the second paragraph, but nothing in the app currently tracks it beyond a
flat list of `distribution` records with no notion of what has been allocated versus
what has actually been paid.

---

## 2. What exists today

Worth being precise about the starting point, because some of the groundwork is
already there.

| Piece           | Where                              | State today                                                                                                                                                                    |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Records         | `finance_records`                  | Five kinds: `asset`, `liability`, `income`, `expense`, `distribution`. One `amount_pence`, one `occurred_on`, optional category, organisation, project.                        |
| Money movements | `finance_movements`                | `proceeds` (asset), `payment` (liability), `reimbursement` (personally-paid expense). Each with date, detail, void, version.                                                   |
| Totals          | `src/lib/finances/summary.ts`      | One shared calculation — estimates, proceeds, still to realise, outstanding, cash in/out, reimbursements. Exportable and unit-tested.                                          |
| Rendering       | `financeRow()` in `workspace.tsx`  | Every kind drawn as the same mobile `task-row` card: icon, title, subtitle, two lines of money, then up to six buttons in a row. This is the "no longer fit for purpose" part. |
| Documents       | `document_links.finance_record_id` | Already linkable to a financial record. The card shows a **count only** — the files themselves are two clicks away.                                                            |
| Notes           | `interactions`                     | Link to organisation, project, task — **not to a financial record**. So "notes about this asset" has nowhere to live today.                                                    |
| History         | `revisions`                        | Every finance record and movement keeps revisions, void reasons, actors. `historyButton("finance_record", …)` already opens it.                                                |
| Export          | `/api/finances/export`             | Three fixed CSV views: inventory, cash, reimbursements.                                                                                                                        |
| Demo data       | —                                  | No finance records are seeded, so the demo shows the empty state.                                                                                                              |

So the data model already supports an asset register reasonably well. What is missing
is (a) the presentation, and (b) a link for notes, and (c) fields that describe an
asset as an asset rather than as a line of money.

---

## 3. The proposed page

### 3.1 Shape

```
┌─ Summary cards (three, richer) ─────────────────────────────────────────┐
│ Estate position      Cash movement      Still to do                     │
└─────────────────────────────────────────────────────────────────────────┘
[ Assets ] [ Debts & expenses ] [ Cash ] [ Distributions ]     ← tabs
Find…  Category ▾  Status ▾  ☐ show voided        [Export] [Add asset]
┌─────────────────────────────────────────────────────────────────────────┐
│ Asset            Status      Estimate  Received  To realise  Docs Notes │
│ ▸ NatWest current a/c  Sold     £4,200    £4,200      —        2    1   │
│ ▾ 14 Oak Lane          Awaiting £310,000  £0      £310,000    4    3   │
│   ┌─ expanded row ───────────────────────────────────────────────────┐  │
│   │ Movement log · Notes · Documents · History        [Edit] [Add…]  │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│ ▸ Premium bonds        Not val.     —        £0         —      0    0   │
├─────────────────────────────────────────────────────────────────────────┤
│ 6 assets                  £455,200  £96,400   £358,800                  │
└─────────────────────────────────────────────────────────────────────────┘
```

A real `<table>` with a sticky header, one row per record, and a totals row that
reflects the current filter — the thing a spreadsheet gives you that the cards cannot.
Below roughly 900px the same data falls back to the existing card list, so a phone
still works; the page simply stops _designing_ for it first.

### 3.2 One grid, kind-aware columns

The five kinds do not share sensible column headings ("Estimate" means nothing for an
expense). Rather than five bespoke tables, define one grid and a column set per kind:

| Kind         | Value     | Received                        | Remaining        |
| ------------ | --------- | ------------------------------- | ---------------- |
| asset        | Estimate  | Proceeds                        | Still to realise |
| liability    | Owed      | Paid                            | Outstanding      |
| income       | Amount    | —                               | —                |
| expense      | Cost      | Reimbursed (if personally paid) | Still owed       |
| distribution | Allocated | Paid                            | Balance          |

That keeps one implementation, one sort, one set of keyboard rules, and still reads
correctly whichever tab you are on.

### 3.3 The expanded row

Rendered directly beneath the row, one panel with four short blocks:

- **Movements** — date, kind, amount, who recorded it, the detail line. Newest first.
  An "Add proceeds" / "Record payment" / "Reimburse" button here rather than in the
  collapsed row.
- **Notes** — the asset's own notes, inline, each with author and date, and a
  two-line "Add a note" composer at the bottom. No dialog. Follow-up tasks if the note
  creates one, reusing the same note card as the contact screen.
- **Documents** — the actual files, not a count: friendly name, category, date,
  _View_ (in-app) and _Download_. Buttons for _Upload_ and _Link existing_, both of
  which already accept `financeRecordId`.
- **History** — the existing revisions dialog, linked rather than duplicated.

All four are collapsed by default except Documents and Movements, and the open/closed
state is remembered per row for the session.

### 3.4 Row actions

Today a row carries up to six buttons. On a table that is noise, and it is what makes
the page feel like a phone list stretched wide. Proposed: **Edit** as the one visible
action, everything else (movement, void/reinstate, bin, history) in a `⋯` menu with
the same labels and confirmations as now. Clicking the row itself expands it; Edit
stays a button so it does not fight with expanding.

---

## 4. Ideas beyond the issue

Ordered by how much they add for the effort, and flagged where they need a schema
change or a judgement call from you.

### Recommended as part of this work

**a. A derived status, and a progress bar.** No schema change: an asset is _not
valued_ (no amount), _to realise_ (no/low proceeds), _part realised_, _realised_
(proceeds ≥ estimate), or _realised above estimate_. A thin bar under the status shows
proceeds against estimate. This is the single biggest readability win in a grid — it
answers "where is this one up to?" without reading three numbers. It also gives the
status filter something real to filter on, with no manual state to keep up to date and
therefore no way to get it wrong.

**b. Totals that follow the filter.** The summary cards describe the whole estate; the
grid footer describes what you are looking at. Every financial app does this and its
absence is why the current page feels like a list rather than a register.

**c. Missing-paperwork and stale-record flags.** A quiet marker on rows with no
document attached, no value recorded, or no activity for 60 days. Cheap, derived from
data already loaded, and it turns the grid from a record of what you did into a
prompt about what is left. The app already does exactly this for tasks via
`attentionDate`.

**d. Search that reaches notes and documents.** The placeholder already says "Search
title, category, or notes…" but `financeQuery` only looks at the record's own fields.
Once notes are attached to assets, search should find them, and document names too.

**e. Export what you can see.** Keep the three fixed CSV views, and add one that
honours the current filter and sort. People will want the numbers in a spreadsheet —
that is the stated mental model — and the export code already takes a record list.

**f. A printable asset schedule.** A `@media print` stylesheet for the grid, so it can
go to a solicitor or sit beside an IHT400 draft. No PDF library, no new route: the
same page, printed. Worth having given how much of probate is "show someone the list".

### Worth doing, but they change the data model

**g. Notes on an asset.** Needs one new nullable column:
`interactions.finance_record_id`. Reusing interactions rather than adding a
`finance_notes` table means notes get author, timestamps, edit history, versions,
document links and follow-up tasks for free, and they appear in the Event log — which
is arguably correct: a note about the house is a thing that happened. This is the
change I would least like to skip, because "notes on an asset" is explicitly in the
issue and there is no honest way to fake it.

**h. Valuation as at a date, and on what basis.** Real probate work needs _values as at
the date of death_, separately from what the asset is worth today and separately from
what it eventually sold for. The app's own probate checklist already tells the user to
do this, then gives them nowhere to record it. Two optional fields —
`valued_on` and `valuation_basis` (date of death / probate / current estimate) — plus
the final proceeds gives a three-point picture per asset and makes the register
genuinely useful for the IHT400 rather than merely tidy.

**i. Ownership share and whether it passes outside the estate.** A house held as
beneficial joint tenants, or an account with a nominated beneficiary, is not an estate
asset in the same way as the rest — and treating it as one overstates the estate.
Suggested fields: `estate_share_percent` (default 100), `held_with` (free text), and a
`passes_outside_estate` flag. Then the cards can show _estate_ value alongside _total_
value, and the register stops quietly giving a wrong number. This is a factual field,
not legal advice — the app is careful about that distinction and should stay so.

**j. Distribution as an allocation, not a single record.** The issue explicitly wants
the eventual distribution visible. Today a distribution is one record with one amount
and one beneficiary, so a part payment cannot be expressed and "allocated £50,000,
paid £20,000" cannot be shown. The minimal fix reuses what already exists: add
`distribution` as a movement kind on distribution records, so a distribution record
becomes "allocated to X" and its movements are "paid to X". Then a Distribution tab
shows per beneficiary: allocated, paid, balance — and a per-asset "given to" for
in-specie transfer, which happens often with jewellery and furniture and is currently
inexpressible.

### Later, or only if you want it

- **Asset activity timeline** — merge movements, notes and documents into one dated
  story per asset, reusing `journal.ts`'s merge and ordering rules. Nice, but the
  four-block expanded row is easier to scan for 3–4 items.
- **Keyboard parity with a spreadsheet** — `j`/`k` between rows, `Enter` to expand,
  `e` to edit, `n` for a note. Fun, and consistent with the "spreadsheet" brief, but
  worth adding once the layout has settled.
- **Column visibility / saved layouts** — remember per user in `localStorage`.
- **A "typical assets" prompt list** — premium bonds, pensions, digital assets, money
  owed to the estate, funeral plan. The app already has this pattern for checklists
  (`template-seeds.ts`), and "what have we forgotten to value?" is a real probate
  problem. Could be a one-click starter set when the register is empty.
- **Rename the section.** If the page is a register, "Estate finances" undersells it;
  "Assets & money" describes what is on it. Small change, but it is on the nav rail.
- **Demo data.** Seed a handful of assets in demo mode so the grid can be seen and
  tested without typing eight records first.

### Deliberately not proposed

- A net-estate or Inheritance Tax calculation. The app says plainly that it does not
  do tax, and the proposed fields are there to _supply_ a figure to a form, not to
  compute one.
- A default 50/50 split. The existing distribution blurb is explicit that no split is
  assumed; an equal-shares helper would be an optional action, never a default.
- A separate "assets" route. The page is the route; the tabs are how it divides.

---

## 5. Data model changes, if all of the above is taken

One migration (0012), all additive and nullable, so existing rows keep working:

```
interactions       + finance_record_id  (nullable, not FK-enforced on delete —
                                          same reasoning as source_task_id)
finance_records    + valued_on            (nullable calendar day)
                   + valuation_basis      (nullable: date_of_death | probate | current)
                   + estate_share_percent (nullable, 100 = whole)
                   + held_with            (nullable text)
                   + passes_outside_estate(nullable boolean, default 0)
                   + given_to             (nullable text, for an in-specie transfer)
finance_movements  + kind 'distribution'   (enum widening only)
```

`summary.ts` would gain an estate-share-aware value, an allocated-versus-paid figure
per beneficiary, and a `distribution` movement kind — all covered by extending the
existing tests rather than rewriting them.

---

## 6. Phasing

| Phase | Content                                                                                                                                                                       | Schema change            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1     | Grid layout, kind-aware columns, sort, filter, totals row, expandable row with movements + documents, row action menu, mobile fallback, print stylesheet, filtered CSV export | none                     |
| 2     | Notes on assets: column, inline note list, composer, search, Event log inclusion                                                                                              | 0012 (interactions only) |
| 3     | Valuation date/basis, ownership share, passes-outside-estate, cards show estate value                                                                                         | 0012 (finance_records)   |
| 4     | Distributions: allocations, movements, per-beneficiary view, in-specie                                                                                                        | 0012 (movements)         |
| 5     | Polish: keyboard, column layouts, starter asset set, demo seed                                                                                                                | none                     |

Phase 1 is the issue as written and stands alone. Phase 2 is the other explicit ask in
the issue. Phases 3–4 are my expansion, and can be dropped without affecting 1–2.

---

## 7. Things I would like your view on

1. **Tabs or one list?** One grid filtered by a Type dropdown (today's behaviour, least
   change), or tabs for Assets / Debts & expenses / Cash / Distributions with their own
   totals? I lean towards tabs: the page has two audiences — "what is it worth" and
   "what has been spent" — and one grid serving both is what the current design
   already struggles with.
2. **Notes: reuse interactions, or a simple notes table?** Reuse is more consistent and
   brings history and documents with it, but asset notes would then show up in the
   Event log and in Unfiled notes' sibling views. Acceptable, or would you rather they
   stayed on the asset page?
3. **How far into asset detail do you want to go?** Valuation date and basis, and the
   joint-ownership share, are what make this useful for the IHT400 — but they also add
   three fields to the Add form. Minimum viable is title, category, estimate, notes,
   documents, and add the rest only where they are needed.
4. **Do distributions need part payments?** "Allocated £50,000, paid £20,000 so far" is
   a real pattern for interim distributions. If a single record with a single amount
   is enough for you, phase 4 gets much smaller.
