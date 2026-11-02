"use client";
import type { ReactNode } from "react";
import {
  CalendarClock,
  ExternalLink,
  History,
  Pencil,
  Plus,
  ScrollText,
} from "lucide-react";
import { Button } from "./ui/button";
import { formatPence } from "@/lib/finances/money";
import { formatShare, type AllowanceLine } from "@/lib/probate/allowances";
import { probateRates, probateSources } from "@/lib/probate/rates";
import type { probateView } from "@/lib/probate/view";
import {
  grantTypeLabels,
  londonToday,
  yesNoUnknownLabels,
} from "@/lib/records/validation";

/**
 * The Probate page: the facts nothing else in the app keeps, the two allowances
 * worked out from them, and — underneath — the probate project's own panel,
 * rendered by the workspace so that notes, tasks, documents and the checklist
 * are the same records seen from a second direction rather than a copy.
 *
 * The page never shows a tax figure. `allowances.ts` cannot produce one, and the
 * sentence under the total says so in plain words.
 */

const day = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

const notRecorded = <span className="probate-missing">Not recorded yet</span>;

function lineValue(line: AllowanceLine) {
  if (line.state === "known") return formatPence(line.pence);
  if (line.state === "not_applicable") return "Not applicable";
  return notRecorded;
}

function lineDetail(
  line: AllowanceLine,
  describe: (line: AllowanceLine) => string,
) {
  if (line.state === "known") return describe(line);
  if (line.state === "not_applicable") return line.reason;
  return `Waiting for ${line.missing}.`;
}

/** A date whose window is always 12 or 24 months from the death. */
function deadlineState(on: string) {
  return on < londonToday() ? "passed" : "ahead";
}

function isStale(checkedOn: string) {
  const checked = new Date(`${checkedOn}T00:00:00Z`);
  const year = 366 * 24 * 60 * 60 * 1000;
  return Date.now() - checked.getTime() > year;
}

export function ProbatePage({
  view,
  documentsInProject,
  onEdit,
  onHistory,
  children,
}: {
  view: ReturnType<typeof probateView>;
  /** How many live documents are filed against the probate project. */
  documentsInProject: number;
  onEdit: () => void;
  onHistory: (id: string) => void;
  /** The project panel, rendered by the workspace from the same code as Projects. */
  children?: ReactNode;
}) {
  const { record, allowances, deadlines, project, projectBinned } = view;

  const share = (basisPoints: number | null) =>
    basisPoints === null
      ? "a share not recorded yet"
      : `${formatShare(basisPoints)} carried across`;

  return (
    <>
      <div className="list-toolbar">
        <h2>{project?.name ?? "Probate & estate administration"}</h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {record && (
            <Button
              variant="outline"
              onClick={() => onHistory(record.id)}
              aria-label="See the history of the probate record"
            >
              <History size={16} aria-hidden />
              History
            </Button>
          )}
          <Button onClick={onEdit}>
            {record ? (
              <>
                <Pencil size={16} aria-hidden /> Edit
              </>
            ) : (
              <>
                <Plus size={16} aria-hidden /> Add the probate record
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="form-help" style={{ marginBottom: "16px" }}>
        The death, the grant, and the figures behind the two Inheritance Tax
        allowances. The estate&apos;s money lives in Estate finances; this page
        is the paperwork around it.
      </p>

      {!record && (
        <section className="panel empty-state spaced">
          <ScrollText size={26} aria-hidden />
          <h2>Nothing recorded yet</h2>
          <p>
            Start with the date of death and the grant. Once those are here, the
            page can show the windows that follow from them and work out the
            allowance from figures you confirm. The probate project is below
            either way — its checklist, notes, tasks and documents are
            unchanged.
          </p>
          <Button onClick={onEdit}>
            <Plus size={16} aria-hidden /> Add the probate record
          </Button>
        </section>
      )}

      {record && (
        <>
          <div className="finance-grid probate-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>The death and the grant</h2>
                  <p>What the rest of the paperwork hangs from.</p>
                </div>
              </div>
              <dl className="money-list probate-facts">
                <Fact label="Person who died" value={record.deceasedName} />
                <Fact
                  label="Date of death"
                  value={record.dateOfDeath ? day(record.dateOfDeath) : null}
                />
                <Fact label="Grant" value={grantTypeLabels[record.grantType]} />
                <Fact
                  label="Applied for"
                  value={
                    record.grantAppliedOn ? day(record.grantAppliedOn) : null
                  }
                />
                <Fact
                  label="Issued"
                  value={
                    record.grantIssuedOn ? day(record.grantIssuedOn) : null
                  }
                />
                <Fact label="Registry" value={record.registry} />
                <Fact label="Reference" value={record.grantReference} />
                {record.lateSpouseName || record.lateSpouseDateOfDeath ? (
                  <Fact
                    label="Late spouse or civil partner"
                    value={[
                      record.lateSpouseName,
                      record.lateSpouseDateOfDeath
                        ? `died ${day(record.lateSpouseDateOfDeath)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ) : null}
              </dl>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Dates that follow</h2>
                  <p>Counted from the date of death, not from today.</p>
                </div>
              </div>
              {deadlines.length ? (
                <dl className="money-list probate-facts">
                  {deadlines.map((item) => (
                    <div
                      className="money-row probate-deadline"
                      key={item.label}
                    >
                      <dt>
                        {item.label}
                        <small className="probate-deadline-detail">
                          {item.detail}
                        </small>
                      </dt>
                      <dd>
                        {day(item.on)}
                        {deadlineState(item.on) === "passed" && (
                          <span className="badge probate-passed">Passed</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="empty-state">
                  <CalendarClock size={22} aria-hidden />
                  Record the date of death and the windows that follow from it
                  appear here.
                </p>
              )}
            </section>
          </div>

          <section className="panel spaced probate-allowances">
            <div className="section-heading">
              <div>
                <h2>Inheritance Tax allowances</h2>
                <p>
                  Worked out from the figures recorded here, and nothing else.
                </p>
              </div>
              <a
                className="subtle-button"
                href={probateSources.calculator}
                target="_blank"
                rel="noopener noreferrer"
              >
                Check on GOV.UK <ExternalLink size={13} aria-hidden />
              </a>
            </div>

            <dl className="money-list probate-allowance-list">
              <div className="money-row">
                <dt>
                  Nil rate band
                  <small>
                    {formatPence(probateRates.nrbPence)}
                    {record.nrbUnusedBp !== null
                      ? ` + ${share(record.nrbUnusedBp)}`
                      : " — the unused share from the late spouse is not recorded yet"}
                  </small>
                </dt>
                <dd className="probate-amount">
                  {lineValue(allowances.basicBand)}
                </dd>
              </div>
              <div className="money-row">
                <dt>
                  Residence nil rate band
                  <small>
                    {formatPence(probateRates.rnrbPence)}
                    {record.rnrbUnusedBp !== null
                      ? ` + ${share(record.rnrbUnusedBp)}`
                      : " — the unused share from the late spouse is not recorded yet"}
                  </small>
                </dt>
                <dd className="probate-amount">
                  {lineValue(allowances.residenceMaximum)}
                </dd>
              </div>
              <div className="money-row money-sub">
                <dt>
                  Less taper
                  <small>
                    {lineDetail(
                      allowances.taper,
                      () =>
                        "£1 is taken off for every £2 the estate is over £2,000,000. The threshold is not doubled for a couple.",
                    )}
                  </small>
                </dt>
                <dd className="probate-amount">
                  {allowances.taper.state === "known"
                    ? allowances.taper.pence
                      ? `− ${formatPence(allowances.taper.pence)}`
                      : "—"
                    : lineValue(allowances.taper)}
                </dd>
              </div>
              <div className="money-row money-sub">
                <dt>
                  Residence band after the taper and the home
                  <small>
                    {lineDetail(allowances.residenceBand, () =>
                      [
                        record.qualifyingResidenceValuePence !== null
                          ? `Capped at ${formatPence(record.qualifyingResidenceValuePence)} left to direct descendants.`
                          : null,
                        allowances.taper.state === "known" &&
                        allowances.taper.pence > 0
                          ? "Already reduced by the taper."
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" "),
                    )}
                  </small>
                </dt>
                <dd className="probate-amount">
                  {lineValue(allowances.residenceBand)}
                </dd>
              </div>
              <div className="money-row money-total">
                <dt>
                  Allowance on these figures
                  <small>
                    Not a tax calculation. An account or a claim is only settled
                    by HMRC.
                  </small>
                </dt>
                <dd className="probate-total">
                  {allowances.totalPence !== null
                    ? formatPence(allowances.totalPence)
                    : `At least ${formatPence(allowances.lowerBoundPence)}`}
                </dd>
              </div>
            </dl>

            {allowances.unconfirmed.length > 0 && (
              <div className="probate-unconfirmed">
                <p className="eyebrow">STILL TO CONFIRM</p>
                <ul>
                  {allowances.unconfirmed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            {allowances.notes.length > 0 && (
              <ul className="probate-notes">
                {allowances.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            <p className="form-help probate-checked">
              Figures checked against GOV.UK on {day(probateRates.checkedOn)}.{" "}
              {isStale(probateRates.checkedOn) ? (
                <strong>
                  These figures may have changed — check GOV.UK before relying
                  on them.
                </strong>
              ) : (
                <>
                  Read the{" "}
                  <a
                    href={probateSources.residenceBand}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    residence band rules
                  </a>
                  , the{" "}
                  <a
                    href={probateSources.transferResidence}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    transfer rules
                  </a>{" "}
                  and{" "}
                  <a
                    href={probateSources.iht436}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    form IHT436
                  </a>
                  .
                </>
              )}
            </p>
          </section>

          <section className="panel spaced">
            <div className="section-heading">
              <div>
                <h2>What has been claimed</h2>
                <p>
                  Recorded as it happened. A claim is not a fact until it has
                  been sent.
                </p>
              </div>
            </div>
            <dl className="money-list probate-facts">
              <Fact
                label="Inheritance Tax account (IHT400)"
                value={yesNoUnknownLabels[record.iht400Needed]}
              />
              <Fact
                label="IHT400 sent"
                value={record.iht400SentOn ? day(record.iht400SentOn) : null}
              />
              <Fact
                label="Nil rate band claim sent"
                value={
                  record.nrbClaimSentOn ? day(record.nrbClaimSentOn) : null
                }
              />
              <Fact
                label="Residence band claim sent (IHT436)"
                value={
                  record.rnrbClaimSentOn ? day(record.rnrbClaimSentOn) : null
                }
              />
              <Fact
                label="Nil rate band claimed"
                value={
                  record.claimedNrbPence !== null
                    ? formatPence(record.claimedNrbPence)
                    : null
                }
              />
              <Fact
                label="Residence band claimed"
                value={
                  record.claimedRnrbPence !== null
                    ? formatPence(record.claimedRnrbPence)
                    : null
                }
              />
              <Fact label="HMRC reference" value={record.claimReference} />
            </dl>
            {!record.iht400SentOn &&
              !record.nrbClaimSentOn &&
              !record.rnrbClaimSentOn && (
                <p className="form-help">
                  Nothing has been recorded as sent yet. If no claim is needed
                  for this estate, record that under Edit rather than leaving it
                  blank — a finished estate should read as finished.
                </p>
              )}
          </section>
        </>
      )}

      <div className="probate-project spaced">
        <div className="section-heading probate-project-heading">
          <div>
            <h2>Notes, tasks and documents</h2>
            <p>
              {projectBinned
                ? "The probate project is in the recoverable bin."
                : `${documentsInProject} document${documentsInProject === 1 ? "" : "s"} filed against the project. The same records as everywhere else, seen from here.`}
            </p>
          </div>
        </div>
        {projectBinned ? (
          <section className="panel empty-state">
            <p>
              The Probate project is in the recoverable bin. Restore it from the
              bin to see its checklist, notes, tasks and documents here. The
              facts above are not affected.
            </p>
          </section>
        ) : project ? (
          children
        ) : (
          <section className="panel empty-state">
            <p>
              There is no Probate project on this workspace yet. Create one from
              Projects to keep its checklist, notes, tasks and documents here
              alongside the facts above. The facts do not depend on it.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

/** One fact, or a plain "Not recorded yet" that never reads as a zero. */
function Fact({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="money-row">
      <dt>{label}</dt>
      <dd className={value ? undefined : "probate-missing"}>
        {value || "Not recorded yet"}
      </dd>
    </div>
  );
}
