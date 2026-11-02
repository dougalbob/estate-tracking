/**
 * One small assembly step: everything the Probate page needs, worked out from
 * the snapshot in one place, so the page, the tests and any future view agree.
 *
 * The record itself is a row; the allowances are derived here and never stored,
 * so a figure on the page can only ever come from the facts behind it.
 */
import type { Snapshot } from "../records/store";
import { calculateAllowances, probateDeadlines } from "./allowances";

/**
 * The seeded project the Probate page renders underneath the facts. Not a
 * foreign key: the project can be renamed, or binned and restored, without the
 * estate's facts moving.
 */
export const probateProjectId = "probate";

export function probateView(snapshot: Snapshot) {
  const record = snapshot.probateRecord;

  const allowances = calculateAllowances({
    netEstateAtDeathPence: record?.netEstateAtDeathPence ?? null,
    nrbUnusedBp: record?.nrbUnusedBp ?? null,
    rnrbUnusedBp: record?.rnrbUnusedBp ?? null,
    qualifyingResidenceValuePence:
      record?.qualifyingResidenceValuePence ?? null,
    residenceToDirectDescendants:
      record?.residenceToDirectDescendants ?? "not_known",
    downsizingAddition: record?.downsizingAddition ?? "not_known",
  });

  return {
    record,
    allowances,
    deadlines: probateDeadlines(record?.dateOfDeath ?? null),
    /**
     * The seeded probate project, when it is not in the bin. The page renders
     * the same panel as the Projects view for it; the record itself does not
     * depend on the project, so binning the project never hides the facts.
     */
    project: snapshot.projects.find((p) => p.id === probateProjectId) ?? null,
    projectBinned: snapshot.deletedProjects.some(
      (p) => p.id === probateProjectId,
    ),
  };
}
