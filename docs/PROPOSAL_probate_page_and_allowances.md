# Proposal — a Probate page, and recording the Inheritance Tax allowances

**Issue:** #31 "Add NRB's to probate features."
**Status:** agreed design — nothing built yet.
**Date:** 2 November 2026.
**Research checked against GOV.UK on:** 2 November 2026 (links at the end).

**Decisions taken on 2 November 2026:**

1. **Shape:** a new top-level **Probate** tab that carries the record, the allowances
   **and the full existing project panel** — checklist, journal, documents and all.
2. **Boundary:** the page does the **allowance arithmetic** from confirmed figures;
   it does **not** calculate tax or decide whether an account or a claim is needed.
3. **Delivery:** **one release**, one pull request, with the commits staged in the
   order below.
4. **Evidence:** the 2010 papers are mostly available, so the page can expect the
   percentages to be confirmed from them — while still supporting "not recorded
   yet" for anything that is missing.

---

## 1. What the issue asks for

The issue asks for three things, and the title and the body are not quite the same
subject:

1. **Record the nil rate bands (NRBs) in the probate features**, including a
   transferable band from a late spouse. English law, one estate.
2. **Check the quoted research before putting it in the code.** The quote is about
   the **residence** nil rate band (RNRB), not the ordinary nil rate band. They are
   two different allowances, with different conditions, different forms and separate
   percentages. Both belong in the answer; conflating them would be wrong.
3. **Start a dedicated Probate page**, to distinguish probate from the estate
   financials.

The rest of this document takes those in order: what is already there, what the
research confirms and where it needs care, and what a page could sensibly be.

---

## 2. What exists today

| Piece                        | Where                                     | State today                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probate as a subject         | `projects` row `probate`, seeded           | A project called **Probate & Estate Administration**, with a 21-item editable starter checklist, its own journal, tasks, notes and documents. It is the filing cabinet, not a probate record.                                                                    |
| The central fact            | —                                          | **There is no date of death anywhere in the schema.** Deadlines that follow from it cannot be shown, and values "as at the date of death" are only prose in a checklist line.                                                                                   |
| Grant details                | —                                          | No grant type, application date, issue date, registry or reference. Nothing records that probate was applied for, issued, or not needed.                                                                                                                       |
| The person who died          | —                                          | No name, no date of birth, no late-spouse details. The app is deliberately about "one estate", but it has no record of whose it is.                                                                                                                             |
| The money                    | `finance_records` + `finance_movements`    | A live asset register: what the estate owns and owes **now**. It is deliberately not a date-of-death valuation, and its values change as things are sold and paid.                                                                                              |
| Tax and allowances           | —                                          | The app deliberately calculates none. The probate checklist says so in words, and unit tests enforce that its wording quotes no figure, rate or threshold (`tests/checklist.test.ts:332-380`).                                                                    |
| Notes, documents and history | `interactions`, `document_links`, `revisions` | All three already hang off a project, and `revisions` is generic over entity type, so a new record would get history for free. Backup is a whole-database snapshot, so a new table needs no backup change.                                                     |
| The written promise          | `README.md:30`, `README.md:155`            | "…it does not provide legal advice, calculate tax, determine debt priority, calculate inheritance entitlement, or recommend safe distributions." Two unit tests and two README paragraphs depend on that sentence.                                              |

So the honest starting position is: **the paperwork has a home; the facts do not.**
Before any allowance is considered, a Probate page would earn its place simply by
recording the date of death and the grant, which nothing currently stores.

---

## 3. The research: what is confirmed

### 3.1 The two bands

|                              | Nil rate band (NRB)                                               | Residence nil rate band (RNRB)                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Amount, 2026/27              | £325,000                                                          | £175,000                                                                                                                                     |
| How long at that amount      | Since 6 April 2009; GOV.UK's table shows it held to 5 April 2031   | £100,000 from 6 April 2017, rising by £25,000 a year; £175,000 since 6 April 2020, shown held to 5 April 2030                                 |
| What it is for               | The estate generally                                             | A home (or a share of one) that the person owned and lived in, passing to direct descendants                                                  |
| Available on a lifetime gift | Yes — gifts use this band first                                   | No — it applies to the death estate only                                                                                                     |
| Transferable from a spouse   | Yes, as a percentage of what was unused                           | Yes, as a percentage of what was unused                                                                                                      |
| Form when a full account     | IHT402, with IHT400                                               | IHT435 (this estate) and IHT436 (the transfer)                                                                                               |

The widely quoted "£1 million for a couple" is simply the sum: two NRBs
(£650,000) and two RNRBs (£350,000). It is not a separate allowance, and no part of
it is automatic.

### 3.2 The RNRB, condition by condition

- **When:** the death must be on or after 6 April 2017. It cannot be used on a
  death before that date.
- **Which home:** only one home qualifies, and it must have been owned **and lived
  in** by the person at some point. A buy-to-let they never lived in does not
  qualify, and only their share counts if they owned part of it.
- **Who inherits:** the home, or the share, must be "closely inherited" by
  **direct descendants** — children, grandchildren, and step, adopted and foster
  children. Siblings, nieces, nephews and friends do not count.
- **How much:** the lower of the home's value and the maximum band. The allowance
  is set against the **whole estate**, not just the house, but it can never be
  larger than the value of the home that passed to descendants. If the home is
  worth £100,000, the band is £100,000; the unused £75,000 cannot be set against
  savings.
- **Taper:** above a **£2 million** estate the band reduces by £1 for every £2 over.
  One band is gone at £2.35 million; a combined £350,000 band is gone at £2.7
  million. **The £2 million is not doubled for a couple.**
- **Downsizing:** if the home was sold or given away on or after **8 July 2015**,
  a downsizing addition may stand in its place, provided other assets pass to
  direct descendants. This is the common case of a house sold to fund care, and it
  is easy to miss.
- **No home at the second death, no band:** unless the downsizing rules apply, a
  transferred RNRB cannot be used if the survivor leaves no qualifying home to
  direct descendants. The transfer is not a free-standing allowance.

### 3.3 What transfers, and how much

- **It is a percentage, not an amount.** What transfers is the *unused percentage*
  at the first death, applied to the band at the **second** death. So a death in
  2010 does not transfer 2010's figure; it transfers 100% of the £175,000 available
  now.
- **Pre-6 April 2017 first deaths are treated as 100% unused**, because there was
  no RNRB to use. GOV.UK adds one condition: *unless that estate was worth more than
  £2 million*, in which case the deemed allowance is tapered too. The deemed figure
  used for the percentage is £100,000, not £175,000.
- **The first spouse need not have owned a home.** The transfer is available even
  if they never held a qualifying residence. What matters is the survivor's home at
  the survivor's death.
- **The home need not be the same one**, and the survivor need not have inherited
  it from the late spouse. They must have lived in it at some stage and it must be
  in their estate.
- **The NRB percentage is separate** and is based on what was actually chargeable
  at the first death, using the NRB in force then. For a death in 2010/11 that is
  £325,000 — so if everything passed to the spouse, 100% was unused. Legacies to
  anyone else, or gifts in the seven years before that death, reduce the percentage.
  The first estate's papers (or HMRC's record of them) are the evidence.
- **The total transferred is capped at 100%**, however many late spouses there were.

### 3.4 Claims and deadlines

| Step                                        | What GOV.UK says                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Inheritance Tax account (IHT400)       | If full details are needed: send within **12 months of the death**, before applying for probate.                                                  |
| Transfer the unused NRB (IHT402)            | With IHT400. The claim must be made within **2 years of the death** (the forms put it as 24 months after the end of the month of death). It is **not automatic**. |
| Claim the RNRB on this estate (IHT435)      | With IHT400.                                                                                                                                      |
| Transfer the unused RNRB (IHT436)           | With IHT400 **and** IHT435; it cannot be used on its own. Same two-year / 24-month deadline.                                                       |
| Excepted estate, death on or after 1 Jan 2022 | The unused **NRB** can be claimed when applying for probate, and any unused amount can be transferred. The RNRB route depends on whether an IHT400 is needed; confirm it with the probate service or HMRC. |
| IHT217                                     | The old full-transfer claim for excepted estates where the death was on or before 31 December 2021. Not the route for a 2026 death.                |

Two practical consequences for this app:

- **A deadline the app can genuinely track**: the claim window runs from the date
  of death, which the app does not currently store. That alone justifies the page.
- **A claim is not a fact until it is sent.** The page should record the percentage
  claimed, the form, the date sent and any HMRC reference, rather than assume a
  figure is in play.

### 3.5 The quoted text, sentence by sentence

| Quoted claim                                                                  | Verdict                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The RNRB was introduced in April 2017 and is currently £175,000 per person"  | **Confirmed.** 6 April 2017, at £100,000; £175,000 from 6 April 2020, held to 5 April 2030.                                                                                                                                  |
| "It applies when a main residence is passed to direct descendants"            | **Confirmed, with conditions.** Owned and lived in; direct descendants (including step, adopted and foster children); one home; capped at the home's value; tapered above £2m; downsizing rules if sold or given away after 8 July 2015. |
| "It is also transferable between spouses, even if the first spouse died before the RNRB existed" | **Confirmed.** The survivor must leave a qualifying home to direct descendants (or meet the downsizing rules), and a first estate over £2m tapers the deemed allowance.                                                        |
| "If your father died in 2010, he couldn't have used any RNRB, so 100% of his RNRB transfers to your mother" | **Confirmed for the RNRB**, provided they were married or civil partners and his estate was under £2m (above that, the deemed allowance tapers). It does not matter whether he owned a home or what he left her. The amount is 100% of **her** death's £175,000 — not a 2010 figure. His **NRB** is a separate claim, and is also 100% unused if everything passed to her and there were no chargeable gifts; that would make £650,000 of basic band. |

Nothing in the quote is wrong. What it omits is what makes the difference between a
useful page and a misleading one: the home must still pass to descendants at the
second death, the band is capped by the home's value, and the £2m taper is not
doubled. Those three omissions are exactly the cases where a family assumes £350,000
and gets £100,000 or £0.

### 3.6 A worked example, with fictional figures

Based on the demo estate (a £250,000 fictional house):

| Line                                                      | Figure     |
| --------------------------------------------------------- | ---------- |
| Net estate at death (house £250,000 + savings £40,000 − debts £5,000) | £285,000 |
| Nil rate band: £325,000 + 100% from the late spouse        | £650,000   |
| Residence band: £175,000 + 100% from the late spouse       | £350,000   |
| Less taper (estate under £2m)                              | £0         |
| Capped at the home left to the children (£250,000)         | **£250,000** |
| **Allowance on these figures**                             | **£900,000** |

The point of the example is the last line before the total: the combined RNRB is
£350,000 on paper, but only £250,000 is available because the house is £250,000. The
other £100,000 is not carried forward. A page that showed "£350,000" and stopped
would be wrong in the one case that matters most.

A second example, for the taper: net estate £2,100,000 gives a £50,000 reduction, so
the combined £350,000 becomes £300,000 (then capped by the home if lower). At
£2,700,000 it is zero.

---

## 4. The principle question: is an allowance a tax calculation?

The app currently says, in the README and in the probate checklist, that it performs
no tax calculation. The issue asks for the allowance rules to go into the code. Those
two things can coexist, but only if the boundary is drawn deliberately.

**Proposed boundary:**

- The app may **work out the allowance** from figures the user confirms, using
  published rates that carry the date they were checked.
- The app may **show the conditions** and which of them are unconfirmed.
- The app may **record the claim**: percentage, form, date sent, reference, amount.
- The app may **show deadlines** that follow from the date of death.
- The app must **never** produce an Inheritance Tax figure, decide whether tax is
  due, decide whether an account or a claim is needed, or say what a claim is
  worth before HMRC has accepted it.
- Every derived figure is phrased as **"on these figures, the allowance would be…"**
  — never "you are entitled to", never "you will pay". No celebratory £0.

This keeps the promise precise rather than weakening it. The README sentence would
become something like:

> It organises user-entered facts and confirmed deadlines; it does not provide legal
> advice, calculate an Inheritance Tax bill, decide whether an account or a claim is
> needed, determine debt priority, calculate inheritance entitlement, or recommend
> safe distributions. It can work out the allowance that figures you confirm would
> produce, and labels that as a worksheet to check with HMRC.

What does **not** change:

- The probate **checklist wording** keeps its no-figures rule and its "deliberately
  does not calculate tax" sentence, so `tests/checklist.test.ts` stays true. The
  figures live in the new page, not in the editable suggestion list. That also keeps
  the list from going stale every time a threshold changes.
- The **asset register** keeps its "no tax, debt-priority or entitlement
  calculations" promise. The new page is a separate place, with a separate purpose.
- The **finance summaries** stay as they are. The probate page will not draw on them
  automatically (see §6.3).

The maintenance risk moves to one module, one date and one test. That is manageable,
and it is better than pretending the subject does not exist.

---

## 5. What the Probate page should be

### 5.1 What it must not be

- **Not a second set of notes, tasks and documents.** The Probate project already
  holds those, and two places to add a note is worse than one. The page is a view
  over the same records.
- **Not a tax return.** HMRC's IHT400 and the GOV.UK calculator are the authority.
- **Not a dashboard.** Two people, one estate, a handful of facts. It should read
  like a page of a file, not a control room.

### 5.2 Shape

```
Probate & estate administration                                    [Edit]
What the estate is, what has been filed, and what is still to come.

┌─ The death and the grant ─────────────────┐  ┌─ Dates that follow ───────────────┐
│ Person who died        Margaret Example   │  │ IHT account (if needed) 12 Sep 27 │
│ Date of death          12 September 2026  │  │ Claim transferable bands 30 Sep 28 │
│ Grant                  Probate            │  │ (each shown only when the fact    │
│ Applied / issued       —                  │  │  that triggers it is recorded)    │
│ Registry / reference   —                  │  │                                   │
└───────────────────────────────────────────┘  └───────────────────────────────────┘

Inheritance Tax allowances                    What this is · Check on GOV.UK
┌───────────────────────────────────────────────────────────────────────────────┐
│ Nil rate band           £325,000, with 100% unused from the late spouse       │
│                         £650,000                                              │
│ Residence nil rate band £175,000, with 100% unused from the late spouse       │
│                         £350,000                                              │
│   less taper            net estate £285,000 — under £2 million        —       │
│   capped at the home    £250,000 left to the children          £250,000       │
│ Allowance on these figures                                    £900,000        │
│ This is the allowance, not a tax calculation. Confirm the figures with HMRC.  │
└───────────────────────────────────────────────────────────────────────────────┘

The claim
IHT400 needed? …   IHT402 sent …   IHT435 …   IHT436 …   reference …

Evidence
Death certificates · marriage certificate · the first grant or IHT papers
(these are the existing Documents, linked to the Probate project)

The probate project        (the same panel as Projects, not a copy)
┌─ Probate & Estate Administration ─ 4 outstanding · 2 orgs · 3 docs ──────┐
│ ▸ Starter checklist (21 suggestions, collapsed until needed)              │
│ ▾ Journal  [task] [note] [document] [task] …                              │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.3 The three blocks, and why each is there

1. **The death and the grant.** The facts nothing else stores, plus the deadlines
   that follow. This block is worth building even with no allowance work at all.
2. **Inheritance Tax allowances.** The two bands, the transfer percentages, the
   taper and the home cap, with the claim recorded beneath. This is the issue's
   actual request. Editing opens one dialog in sections, and the worksheet updates
   as figures are typed, in the same way the movement dialog shows the remaining
   balance while an amount is entered.
3. **The probate project.** The existing panel in full — the collapse control, the
   organisation pills, the document badges, the starter checklist, the Hide Done
   control and the journal — rendered from the same code as the Projects view, not
   a second copy. Today that panel is the body of `data.projects.map(...)` inside
   `Workspace` (`workspace.tsx:2316-2625`), and it depends on a dozen closures:
   `taskRow`, `interactionCard`, `journalDocumentRow`, `edit`, `historyButton`,
   `handleDelete`, `setDocUpload`, `setLinkPicker`, `setViewingDoc`,
   `downloadDocument`, `collapsedProjects`, `projectShowDone`. The safe move is to
   lift that body into **one `projectPanel(p)` renderer inside `Workspace`**, used
   by both the Projects view and the Probate page. It is a pure move of existing
   JSX: no new component with twenty props, no new state, and the same handlers.
   The page passes the rendered panel in as its children. The Probate page's own
   new blocks stay in `src/components/probate.tsx`, so `workspace.tsx` gains the
   renderer and the view switch, not another thousand lines of new UI.

### 5.4 Where it sits

A top-level **Probate** item in the sidebar, between **Calendar** and **Estate
finances**, titled **Probate & estate administration** on the page. The project stays
listed in **Projects** as it is today, so it can still be renamed, binned or given
notes from there; the page reads the same `probate` project by its id and shows the
same panel. That is one more sidebar item (thirteen including Backup and Bin), and
the panel appears in two places by design — one record, two ways in.

Two edge cases follow from that:

- **The project is in the bin.** The panel cannot render; the page shows the facts
  and allowances and a calm line: "The Probate project is in the recoverable bin.
  Restore it to see its checklist, notes and documents." No error, no empty panel.
- **The panel is collapsed on Projects.** The collapse state is keyed by project id,
  so the page opens the same way it was left. That is consistent rather than
  surprising: it is the same panel, and the chevron on the page expands it.

### 5.5 Wording rules

- "Late spouse or civil partner", not "TNRB"/"TRNRB" on screen. The form names
  belong in a help line: "claimed on IHT436".
- "Not recorded yet" rather than a blank that reads as £0.
- "On these figures, the allowance would be…" — never "you are entitled to".
- The date the rates were checked is always visible: "Figures checked against
  GOV.UK on 2 November 2026."
- If that date is more than a year old, a quiet line: "These figures may have
  changed — check GOV.UK before relying on them." Not an alarm, not a modal.
- No tax line, no percentage rate, no "you will pay" anywhere.

---

## 6. Data model

### 6.1 One new table, one row

`probate_record` — one row for the one estate, created on first save and never
binned (corrections keep their history, as everywhere else). Suggested groups:

| Group            | Fields                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| The death        | `deceasedName`, `dateOfDeath`                                                                            |
| The grant        | `grantType` (probate / letters of administration / not needed / not known), `grantAppliedOn`, `grantIssuedOn`, `registry`, `grantReference` |
| The late spouse  | `lateSpouseName`, `lateSpouseDateOfDeath`, `nrbUnusedBp`, `rnrbUnusedBp` (basis points, 0–10000)          |
| The figures      | `netEstateAtDeathPence`, `qualifyingResidenceValuePence`, `residenceToDirectDescendants` (yes/no/not known), `downsizingAddition` (yes/no/not known) |
| The claim        | `iht400Needed` (yes/no/not known), `iht400SentOn`, `nrbClaimSentOn`, `rnrbClaimSentOn`, `claimReference`, `claimedNrbPence`, `claimedRnrbPence` |
| The rate snapshot| `rates` (JSON: the two bands, the taper threshold, the date checked)                                      |
| Housekeeping     | `version`, `createdBy`, `createdAt`, `updatedAt`, `deletedAt`                                             |

Why this shape:

- **Percentages are basis points**, not floats. Money is integer pence everywhere
  else, and a percentage from IHT402 can be fractional (a £1,000 legacy against
  £325,000 is not a whole percent). 0–10000 covers 0–100.00% exactly, and the
  validation is a plain integer range.
- **The rate snapshot is stored with the record**, so a later change to the
  published figures cannot silently rewrite what was claimed. The page shows the
  snapshot in the history, and the current rates in the worksheet.
- **"Not known" is a value**, not a blank. The worksheet must be able to say it
  cannot check the taper or the cap yet.
- **No estate-value field taken from the register.** See §6.3.
- The record is **not** linked to the project by a foreign key; the page reads the
  seeded `probate` project by its id, exactly as the checklist does. One estate,
  one project, no ambiguity.

### 6.2 The rest of the plumbing

- A new entity kind in `revisions` ("probate_record"). The History dialog already
  filters by entity and id, so it opens unchanged; `record-summary.tsx` needs the
  new field captions and the money/date formatting, or the before/after values
  render as an empty list. Basis-point fields need a percentage formatter (10000 →
  100%), and the `rates` snapshot should show as the checked-on date and the three
  figures, not as `[object Object]`.
- `probateRecordInput` in `validation.ts` (zod), save through `withStore`, the same
  version-conflict path as every other record, and a `saveProbateRecord` action.
- Snapshot: one more row, so no new fetch pattern; the page's server render gets it
  from `store.snapshot()`.
- Backup: unchanged (whole-database snapshot).
- Documents and notes: linked to the **Probate project** for v1, which already
  works, and shown on the page as counts with a link. A direct `document_links`
  column is possible later if the page needs its own file list.
- Demo: a fictional record in `scripts/seed-demo-probate.ts`, refusing any database
  path without `demo` in it, like the other seed scripts. The demo already has a
  fictional £250,000 house to hang the example on.

### 6.3 Why the estate value is typed, not derived

The asset register is **what the estate is worth now**, and it moves: assets sell,
debts are paid, values are re-estimated. The Inheritance Tax figures are **as at the
date of death**, and they are a snapshot that the IHT400 fixes. Deriving one from
the other would produce a confident number that is not the number HMRC asks for.

So the page takes one user-confirmed **net estate at death** figure, with help text
saying where it comes from (the probate application or IHT400 figures), and links to
the register. A later option is a "value at date of death" flag on an asset, but it
is a bigger change to the register and is not needed for v1.

The same applies to the home: the page offers a picker of property assets to copy a
value **as a convenience**, with a sentence that the date-of-death valuation may
differ. It never assumes the register's current value is the right one.

---

## 7. The worksheet, precisely

### 7.1 Inputs

- Date of death (from the record).
- Late spouse's date of death, and the unused percentages for each band. If the
  late spouse's death was before 6 April 2017, the RNRB percentage defaults to
  100% and the help says why, with the over-£2m caveat. The NRB percentage is
  **never** defaulted: it depends on what was actually chargeable at the first
  death, and a guess there would overstate the claim.
- Net estate at death (one figure, user-confirmed).
- The value of the home or share passing to direct descendants.
- Two conditions the user ticks: the home was owned and lived in by the person at
  some point, and it passed to direct descendants. A third for downsizing.
- Nothing else. No gifts, no reliefs, no will trusts, no charity rate.

### 7.2 The arithmetic

All in integer pence; percentages in basis points; rounded to the penny once, at the
end of each line.

1. **Basic band** = £325,000 × (1 + NRB unused%).
2. **Residence maximum** = £175,000 × (1 + RNRB unused%). The transfer is capped
   at 100%, so the multiplier is at most 2.
3. **Taper** = half of (net estate − £2,000,000), never below zero, subtracted from
   the residence maximum, never below zero.
4. **Residence band** = the lower of the tapered figure and the value of the home
   passing to direct descendants.
5. **Allowance on these figures** = basic band + residence band.
6. **Stop.** There is no step 7.

If any input is missing, the affected line reads "not recorded yet" and the total is
shown as a lower bound or withheld, rather than treating a blank as zero. That
matters: a blank home value must never look like "no RNRB is due".

### 7.3 What it shows beside the numbers

- The words for the condition on each line ("capped at the home left to the
  children"), not just a figure.
- Which conditions are unconfirmed, in plain sentences.
- A link to GOV.UK's calculator and the IHT435/IHT436 pages.
- The checked-on date for the rates.
- A line that the claim is not made until it is sent, and that HMRC decides.
- "Not needed" as a recordable outcome, so an estate that needed no claim does not
  look like a page with something missing.
- The evidence itself as the existing documents (death certificate, marriage
  certificate, the first grant or IHT papers), shown with View and Download and an
  **Upload** / **Link existing** pair. No second "received" tick-box list: the file
  is the record, as it is everywhere else in the app.

### 7.4 Tests for the module

Pure functions in `src/lib/probate/allowances.ts`, like `finances/summary.ts`, so the
page and the tests cannot disagree:

- 0%, 50%, 100% unused, for each band separately.
- A home worth less than the combined band; a home worth more; a share of a home.
- Taper at exactly £2m, £2.1m, £2.35m and £2.7m, including the combined band.
- No home, or not to direct descendants: residence band is zero, and the reason is
  in the result, not silently dropped.
- Pre-2017 first death: 100% suggested, editable, with the over-£2m caveat shown.
- Percentages outside 0–100 rejected; basis-point rounding; no negative figures.
- **The result type has no tax field**, so no future screen can add one by accident
  without changing the type.
- The stored rate snapshot is what the history shows after a rate change.

---

## 8. One release: the build plan

One pull request, four commits. Each commit builds and passes the gates, so the
history stays readable even though it ships as one change.

### Commit 1 — the record

| Path                                | Change                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema.ts`              | `probateRecord` table: the fields in §6.1                                                                                               |
| `drizzle/0013_add_probate_record.sql` (and `meta/`) | Additive migration; one table, no data rewrite                                                                             |
| `src/lib/records/validation.ts`     | `probateRecordInput`: dates, percentages as numbers 0–100, pounds strings for money, cross-field checks (a grant cannot precede the death; a late spouse must have died first) |
| `src/lib/probate/store.ts`          | `probateStore` in the style of `finances/store.ts`: singleton upsert, version conflict, audit, rate snapshot, percentage-to-basis-points conversion |
| `src/lib/records/store.ts`          | Spread the store in, add `probateRecord` to `snapshot()`                                                                                |
| `src/app/actions.ts`                | `saveProbateRecord`, one line inside `withStore`                                                                                        |
| `src/components/record-summary.tsx` | Captions for the new field names, plus money and date formatting                                                                        |
| `tests/probate-record.test.ts`      | Create, edit, stale version refused, percentages stored exactly, revision before/after, snapshot row                                     |

### Commit 2 — the page and the panel

| Path                             | Change                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/workspace.tsx`   | Lift the project panel body into `projectPanel(p)`; Projects maps it; add the `probate` sidebar item, the title case and the view switch; render the new page with the panel as children |
| `src/components/probate.tsx`     | `ProbatePage`: the death and grant block, the dates that follow, the empty state, the binned-project case; the panel comes in as `children`                                            |
| `src/app/globals.css`            | The two-column facts grid and the allowance block; reuse `.panel`, `.money-list`, `.money-row`, `.money-total`; one column below 900px                                                |
| `scripts/seed-demo-probate.ts`   | A fictional record (the demo house is £250,000), refusing any path without `demo` in it                                                                                              |
| `README.md`, `docs/IMPLEMENTATION_PLAN.md` | First pass: the page exists, the facts it holds, the deadlines; no allowance wording yet                                                                                     |

The panel extraction is a **pure move**. Before and after, the Projects view must
render identical markup — the same task counts, checklist, journal, collapse state
and handlers. The render harness from earlier sessions is the check: render the
Projects view from the same demo data on both sides of the move and compare the
markup, then render the Probate view and assert the panel is there once, with the
same content.

### Commit 3 — the allowances

| Path                             | Change                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/probate/allowances.ts`  | Dated rate constants and `calculateAllowances(input)`: basic band, residence maximum, taper, home cap, total, and a per-line state (`known` / `not recorded`) |
| `tests/probate-allowances.test.ts` | Every case in §7.4, plus the three GOV.UK worked examples as fixtures                                                                                      |
| `src/components/probate-form.tsx` | The editor: one dialog in sections, worksheet recalculated as figures are typed, focus restored on close, version sent with the save                          |
| `src/components/probate.tsx`     | The allowance block, the claim tracker, the evidence prompts and the checked-on line                                                                        |
| `README.md`                      | The precise "allowance, not tax" wording from §4; the new Probate section; the current-state table                                                           |

### Commit 4 — the polish

The quiet "these figures may have changed" line after twelve months, the responsive
pass, the copy pass ("late spouse or civil partner", "not recorded yet"), the final
README and plan update with the true test count, and all gates.

### Gates

`npm test`, `npm run typecheck`, `npm run format:check`, `npm run build`, and a
by-hand render of the page in the demo database. The README's current-state table and
test count are updated in the same PR, as the repository's own rule requires. The
checklist test that forbids figures in the probate wording is deliberately untouched —
the figures are on the page, not in the editable list.

### Size

Roughly: one migration, one table, one pure module, one store, two new components
(the page and the editor), one extracted renderer, one seed script, two test files,
and the two documents. It is a large single PR by this repository's standards, which
is the cost of the one-release decision; the four commits are there to make the
review tractable.

**Explicitly not in this change:**

- Any tax figure, rate of tax, or "no tax to pay" statement.
- A decision that an IHT400 or a claim is needed.
- Automatic task creation for the deadlines (the list offers, the user chooses, as
  the checklist already does).
- Deriving the estate or home value from the register.
- A second notes/tasks/documents store.
- Any change to the finances page.

---

## 9. Risks

| Risk                                                | Mitigation                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The figures go stale                                | One dated constants module, the checked-on date shown, a quiet "check GOV.UK" line after twelve months, and one test asserting the date is present and the figures match the table. |
| The page drifts into a tax calculator               | The result type has no tax field; the README wording is precise; the checklist's no-figures test stays; a review rule in this document. |
| False comfort from incomplete facts                 | "Not recorded yet" states, per-line condition text, a visible list of unconfirmed conditions, and a link to HMRC.             |
| Duplication with the Probate project                | One set of records and one panel implementation: the page renders the same `projectPanel(p)` as Projects, with the same handlers and state. |
| The first estate's papers cannot be found           | The claim block records what is known and what is still to get; the evidence list prompts for the death and marriage certificates and any first grant. The percentage can be left unrecorded without the page guessing. |
| The law changes (for example, the 2027 pension change) | The page records the date of death, so the case can be identified and checked; the app does not model the pension change. The checked-on date and the links make the boundary visible. |

---

## 10. Decisions, and the details still to settle in the build

Settled on 2 November 2026 (also at the top of this document):

1. **Shape:** a new Probate tab carrying the record, the allowances and the full
   existing project panel, with the panel lifted into one shared renderer.
2. **Boundary:** the allowance worksheet does the arithmetic from confirmed figures;
   no tax figure and no decision about whether an account or claim is needed.
3. **Delivery:** one release, one pull request, four commits.
4. **Evidence:** the 2010 papers are mostly available, so the page expects the
   percentages to be confirmed from them. It still supports "not recorded yet", but
   it does not need a second evidence-tracking workflow: the documents are the
   evidence, linked to the Probate project.

Still to settle while building, none of which changes the shape:

- **Where the total goes when a figure is missing.** The recommendation is a
  clearly labelled lower bound ("at least £650,000, before the home is recorded")
  rather than a hidden total. That needs a plain sentence, not a warning colour.
- **What the claim block shows for an estate that needed no claim.** "Not needed"
  is a recorded outcome; the block should read as finished, not as a gap.
- **Whether the probate flow joins the Playwright workflow spec.** The sandbox has
  no browser, so the page will be covered by the render harness and unit tests in
  this change; adding it to the browser spec is a separate, later job.
- **The demo record's figures.** They should match the fictional house
  (£250,000) and produce the cap case in §3.6, so the preview shows the interesting
  line rather than a round £1m.

---

## Appendix — GOV.UK pages checked (2 November 2026)

- How Inheritance Tax works — <https://www.gov.uk/inheritance-tax>
- Passing on a home — <https://www.gov.uk/inheritance-tax/passing-on-home>
- Check if an estate qualifies for the RNRB —
  <https://www.gov.uk/guidance/check-if-you-can-get-an-additional-inheritance-tax-threshold>
- Work out and apply the RNRB —
  <https://www.gov.uk/guidance/inheritance-tax-residence-nil-rate-band>
- Transferring unused RNRB —
  <https://www.gov.uk/guidance/inheritance-tax-transfer-of-threshold>
- Transferring unused basic threshold —
  <https://www.gov.uk/guidance/transferring-unused-basic-threshold-for-inheritance-tax>
- IHT436 (transferable RNRB) —
  <https://www.gov.uk/government/publications/claim-to-transfer-any-unused-residence-nil-rate-band-iht436>
- IHT402 (transferable NRB) —
  <https://www.gov.uk/government/publications/inheritance-tax-claim-to-transfer-unused-nil-rate-band-iht402>
- Rates and allowances: Inheritance Tax thresholds —
  <https://www.gov.uk/government/publications/rates-and-allowances-inheritance-tax-thresholds-and-interest-rates/inheritance-tax-thresholds-and-interest-rates>
- Check if you need to send full details of the estate —
  <https://www.gov.uk/valuing-estate-of-someone-who-died/check-type-of-estate>
- Downsizing, selling or gifting a home —
  <https://www.gov.uk/guidance/how-downsizing-selling-or-gifting-a-home-affects-the-additional-inheritance-tax-threshold>
- HMRC RNRB calculator — <https://www.tax.service.gov.uk/calculate-additional-inheritance-tax-threshold>
