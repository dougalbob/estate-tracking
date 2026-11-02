"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { saveProbateRecord } from "@/app/actions";
import { formatPence } from "@/lib/finances/money";
import {
  calculateAllowances,
  shareToBasisPoints,
  shareToInput,
} from "@/lib/probate/allowances";
import type { ProbateRecord } from "@/lib/probate/store";
import {
  grantTypeLabels,
  grantTypes,
  label,
  yesNoUnknown,
  yesNoUnknownLabels,
  type ProbateRecordInput,
} from "@/lib/records/validation";

/**
 * Create or correct the probate record.
 *
 * The dialog follows the same rules as every other form in the app: it sends the
 * version it was opened with, so a stale edit is refused rather than
 * overwriting; a refusal keeps the draft; and closing returns the keyboard to
 * the button that opened it.
 *
 * The worksheet under the fields is recalculated from what has been typed, in
 * the same way the movement dialog shows the balance before it is recorded. It
 * is a preview of the page, not a second implementation of the arithmetic.
 */
export function ProbateForm({
  record,
  onClose,
  onSaved,
}: {
  record?: ProbateRecord;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState({
    deceasedName: record?.deceasedName ?? "",
    dateOfDeath: record?.dateOfDeath ?? "",
    grantType: record?.grantType ?? "not_known",
    grantAppliedOn: record?.grantAppliedOn ?? "",
    grantIssuedOn: record?.grantIssuedOn ?? "",
    registry: record?.registry ?? "",
    grantReference: record?.grantReference ?? "",
    lateSpouseName: record?.lateSpouseName ?? "",
    lateSpouseDateOfDeath: record?.lateSpouseDateOfDeath ?? "",
    nrbUnused: shareToInput(record?.nrbUnusedBp ?? null),
    rnrbUnused: shareToInput(record?.rnrbUnusedBp ?? null),
    netEstateAtDeath:
      record?.netEstateAtDeathPence === null ||
      record?.netEstateAtDeathPence === undefined
        ? ""
        : formatPence(record.netEstateAtDeathPence).replace(/[£,]/g, ""),
    qualifyingResidenceValue:
      record?.qualifyingResidenceValuePence === null ||
      record?.qualifyingResidenceValuePence === undefined
        ? ""
        : formatPence(record.qualifyingResidenceValuePence).replace(
            /[£,]/g,
            "",
          ),
    residenceToDirectDescendants:
      record?.residenceToDirectDescendants ?? "not_known",
    downsizingAddition: record?.downsizingAddition ?? "not_known",
    iht400Needed: record?.iht400Needed ?? "not_known",
    iht400SentOn: record?.iht400SentOn ?? "",
    nrbClaimSentOn: record?.nrbClaimSentOn ?? "",
    rnrbClaimSentOn: record?.rnrbClaimSentOn ?? "",
    claimReference: record?.claimReference ?? "",
    claimedNrb:
      record?.claimedNrbPence === null || record?.claimedNrbPence === undefined
        ? ""
        : formatPence(record.claimedNrbPence).replace(/[£,]/g, ""),
    claimedRnrb:
      record?.claimedRnrbPence === null ||
      record?.claimedRnrbPence === undefined
        ? ""
        : formatPence(record.claimedRnrbPence).replace(/[£,]/g, ""),
  });

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const set = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  function close() {
    if (!dirty || window.confirm("Discard the changes in this form?"))
      onClose();
  }

  /**
   * The preview, worked out from what is in the boxes right now. A percentage
   * that will not parse is shown as not recorded here; the save reports it
   * properly, with the field named, rather than the preview pretending.
   */
  const preview = useMemo(() => {
    const pounds = (value: string) => {
      if (!value.trim()) return null;
      try {
        const cleaned = value.replace(/[£\s,]/g, "");
        if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(cleaned)) return null;
        return Math.round(Number(cleaned) * 100);
      } catch {
        return null;
      }
    };
    const share = (value: string) => {
      try {
        return shareToBasisPoints(value);
      } catch {
        return null;
      }
    };
    return calculateAllowances({
      netEstateAtDeathPence: pounds(fields.netEstateAtDeath),
      nrbUnusedBp: share(fields.nrbUnused),
      rnrbUnusedBp: share(fields.rnrbUnused),
      qualifyingResidenceValuePence: pounds(fields.qualifyingResidenceValue),
      residenceToDirectDescendants: fields.residenceToDirectDescendants as
        "yes" | "no" | "not_known",
      downsizingAddition: fields.downsizingAddition as
        "yes" | "no" | "not_known",
    });
  }, [fields]);

  async function submit() {
    setError("");
    // Percentages are typed as "37.5" and stored as basis points, so they can
    // never drift by a floating-point penny. A figure that will not parse is
    // named here rather than being silently dropped on the way to the store.
    let nrbUnusedBp: number | null;
    let rnrbUnusedBp: number | null;
    try {
      nrbUnusedBp = shareToBasisPoints(fields.nrbUnused);
    } catch {
      setError(
        "Nil rate band unused: enter a percentage between 0 and 100, or leave it blank.",
      );
      return;
    }
    try {
      rnrbUnusedBp = shareToBasisPoints(fields.rnrbUnused);
    } catch {
      setError(
        "Residence band unused: enter a percentage between 0 and 100, or leave it blank.",
      );
      return;
    }
    setBusy(true);
    try {
      const { nrbUnused, rnrbUnused, ...rest } = fields;
      void nrbUnused;
      void rnrbUnused;
      // Typed as the validator's own input, so a field renamed on one side and
      // not the other is a type error here rather than a silently dropped fact.
      const payload = {
        ...rest,
        id: record?.id,
        version: record?.version,
        nrbUnusedBp,
        rnrbUnusedBp,
      } satisfies ProbateRecordInput;
      const result = await saveProbateRecord(payload);
      if (result.ok) {
        setDirty(false);
        router.refresh();
        onSaved("Probate record saved.");
      } else {
        setError(result.error);
        if (result.code === "conflict") router.refresh();
      }
    } catch {
      setError(
        "The connection was interrupted. Your draft is still here – check it before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  const optionList = (
    values: readonly string[],
    labels?: Record<string, string>,
  ) =>
    values.map((value) => (
      <option key={value} value={value}>
        {labels?.[value] ?? label(value)}
      </option>
    ));

  return (
    <dialog
      ref={dialog}
      className="record-dialog probate-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="probate-form-title"
    >
      <form
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">THE FACTS BEHIND THE PAPERWORK</p>
            <h2 id="probate-form-title">
              {record ? "Edit the probate record" : "Add the probate record"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close form"
            onClick={close}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>

        <fieldset disabled={busy} className="form-fields">
          <fieldset className="follow-up">
            <legend>The death and the grant</legend>
            <div className="form-grid">
              <label>
                Person who died
                <input
                  value={fields.deceasedName}
                  maxLength={200}
                  onChange={(e) => set("deceasedName", e.target.value)}
                  placeholder="Their full name"
                />
              </label>
              <label>
                Date of death
                <input
                  type="date"
                  value={fields.dateOfDeath}
                  onChange={(e) => set("dateOfDeath", e.target.value)}
                />
                <small className="form-help">
                  The date every probate window runs from.
                </small>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Grant
                <select
                  value={fields.grantType}
                  onChange={(e) => set("grantType", e.target.value)}
                >
                  {optionList(grantTypes, grantTypeLabels)}
                </select>
              </label>
              <label>
                Registry
                <input
                  value={fields.registry}
                  maxLength={200}
                  onChange={(e) => set("registry", e.target.value)}
                  placeholder="For example, Newcastle"
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Applied for
                <input
                  type="date"
                  value={fields.grantAppliedOn}
                  onChange={(e) => set("grantAppliedOn", e.target.value)}
                />
              </label>
              <label>
                Issued
                <input
                  type="date"
                  value={fields.grantIssuedOn}
                  onChange={(e) => set("grantIssuedOn", e.target.value)}
                />
              </label>
            </div>
            <label>
              Grant reference
              <input
                value={fields.grantReference}
                maxLength={120}
                onChange={(e) => set("grantReference", e.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="follow-up">
            <legend>The late spouse or civil partner</legend>
            <p className="form-help">
              Leave this blank for someone who was not widowed. Where the first
              death was before 6 April 2017, 100% of the residence band is
              normally still unused — IHT436 confirms it.
            </p>
            <div className="form-grid">
              <label>
                Their name
                <input
                  value={fields.lateSpouseName}
                  maxLength={200}
                  onChange={(e) => set("lateSpouseName", e.target.value)}
                />
              </label>
              <label>
                Their date of death
                <input
                  type="date"
                  value={fields.lateSpouseDateOfDeath}
                  onChange={(e) => set("lateSpouseDateOfDeath", e.target.value)}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Nil rate band unused (%)
                <input
                  inputMode="decimal"
                  value={fields.nrbUnused}
                  onChange={(e) => set("nrbUnused", e.target.value)}
                  placeholder="Leave blank if not known"
                />
                <small className="form-help">
                  What their estate left unused, as IHT402 records it. Usually
                  100 where everything passed to the survivor and there were no
                  chargeable gifts.
                </small>
              </label>
              <label>
                Residence band unused (%)
                <input
                  inputMode="decimal"
                  value={fields.rnrbUnused}
                  onChange={(e) => set("rnrbUnused", e.target.value)}
                  placeholder="Leave blank if not known"
                />
                <small className="form-help">
                  100 where that death was before 6 April 2017 and the estate
                  was under £2 million.
                </small>
              </label>
            </div>
          </fieldset>

          <fieldset className="follow-up">
            <legend>The estate at the date of death</legend>
            <p className="form-help">
              These are the figures on the probate application or the IHT400,
              not today&apos;s values from Estate finances.
            </p>
            <div className="form-grid">
              <label>
                Net value of the estate (£)
                <input
                  inputMode="decimal"
                  value={fields.netEstateAtDeath}
                  onChange={(e) => set("netEstateAtDeath", e.target.value)}
                  placeholder="Assets less debts"
                />
                <small className="form-help">
                  Everything owned, less everything owed, on the day they died.
                  It decides whether the £2 million taper applies.
                </small>
              </label>
              <label>
                Home left to direct descendants (£)
                <input
                  inputMode="decimal"
                  value={fields.qualifyingResidenceValue}
                  onChange={(e) =>
                    set("qualifyingResidenceValue", e.target.value)
                  }
                  placeholder="Their share only"
                />
                <small className="form-help">
                  Their share of the home, before any mortgage. The residence
                  band is capped at this figure.
                </small>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Did the home pass to direct descendants?
                <select
                  value={fields.residenceToDirectDescendants}
                  onChange={(e) =>
                    set("residenceToDirectDescendants", e.target.value)
                  }
                >
                  {optionList(yesNoUnknown, yesNoUnknownLabels)}
                </select>
                <small className="form-help">
                  Children, grandchildren, and step, adopted or foster children.
                  A sibling, niece or friend does not count.
                </small>
              </label>
              <label>
                Downsizing addition?
                <select
                  value={fields.downsizingAddition}
                  onChange={(e) => set("downsizingAddition", e.target.value)}
                >
                  {optionList(yesNoUnknown, yesNoUnknownLabels)}
                </select>
                <small className="form-help">
                  Where a home was sold or given away on or after 8 July 2015,
                  IHT435 can stand an addition in its place.
                </small>
              </label>
            </div>
          </fieldset>

          <fieldset className="follow-up">
            <legend>What has been claimed</legend>
            <p className="form-help">
              A claim is not a fact until it has been sent. Record it here once
              it has.
            </p>
            <div className="form-grid">
              <label>
                Is an Inheritance Tax account (IHT400) needed?
                <select
                  value={fields.iht400Needed}
                  onChange={(e) => set("iht400Needed", e.target.value)}
                >
                  {optionList(yesNoUnknown, yesNoUnknownLabels)}
                </select>
              </label>
              <label>
                IHT400 sent
                <input
                  type="date"
                  value={fields.iht400SentOn}
                  onChange={(e) => set("iht400SentOn", e.target.value)}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Nil rate band claim sent (IHT402, or with the probate
                application)
                <input
                  type="date"
                  value={fields.nrbClaimSentOn}
                  onChange={(e) => set("nrbClaimSentOn", e.target.value)}
                />
              </label>
              <label>
                Residence band claim sent (IHT436)
                <input
                  type="date"
                  value={fields.rnrbClaimSentOn}
                  onChange={(e) => set("rnrbClaimSentOn", e.target.value)}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Nil rate band claimed (£)
                <input
                  inputMode="decimal"
                  value={fields.claimedNrb}
                  onChange={(e) => set("claimedNrb", e.target.value)}
                />
              </label>
              <label>
                Residence band claimed (£)
                <input
                  inputMode="decimal"
                  value={fields.claimedRnrb}
                  onChange={(e) => set("claimedRnrb", e.target.value)}
                />
              </label>
            </div>
            <label>
              HMRC reference
              <input
                value={fields.claimReference}
                maxLength={120}
                onChange={(e) => set("claimReference", e.target.value)}
              />
            </label>
          </fieldset>

          <div className="probate-preview" aria-live="polite">
            <p className="eyebrow">ON THESE FIGURES</p>
            <dl className="money-list">
              <div className="money-row">
                <dt>Nil rate band</dt>
                <dd>
                  {preview.basicBand.state === "known"
                    ? formatPence(preview.basicBand.pence)
                    : "Not recorded yet"}
                </dd>
              </div>
              <div className="money-row">
                <dt>Residence band</dt>
                <dd>
                  {preview.residenceBand.state === "known"
                    ? formatPence(preview.residenceBand.pence)
                    : "Not recorded yet"}
                </dd>
              </div>
              <div className="money-row money-total">
                <dt>Allowance on these figures</dt>
                <dd>
                  {preview.totalPence !== null
                    ? formatPence(preview.totalPence)
                    : `At least ${formatPence(preview.lowerBoundPence)}`}
                </dd>
              </div>
            </dl>
            <p className="form-help">
              This is the allowance, not a tax calculation. An account or a
              claim is only settled by HMRC.
            </p>
          </div>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : record ? "Save changes" : "Save the record"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
