/**
 * The published Inheritance Tax figures this app is allowed to quote, and the
 * date they were checked.
 *
 * They are deliberately in one place. The probate page shows the checked date
 * next to every figure, and a unit test asserts that the figures still match the
 * table they were copied from, so a stale number is a test failure rather than a
 * quiet lie. The page also warns, in plain words, when the checked date is more
 * than a year old.
 *
 * Checked against GOV.UK's "Rates and allowances: Inheritance Tax thresholds and
 * interest rates" on 2 November 2026:
 *  - nil rate band: £325,000 from 6 April 2009 to 5 April 2031;
 *  - residence nil rate band: £175,000 from 6 April 2020 to 5 April 2030;
 *  - the residence band tapers by £1 for every £2 of an estate over £2,000,000.
 *
 * Pence throughout, like every other amount in the app.
 */
export type ProbateRates = {
  /** The day these figures were last read from GOV.UK, as YYYY-MM-DD. */
  checkedOn: string;
  nrbPence: number;
  rnrbPence: number;
  taperThresholdPence: number;
};

export const probateRates: ProbateRates = {
  checkedOn: "2026-11-02",
  nrbPence: 32_500_000,
  rnrbPence: 17_500_000,
  taperThresholdPence: 200_000_000,
};

/** The source pages, so the page can point at the authority rather than at us. */
export const probateSources = {
  overview: "https://www.gov.uk/inheritance-tax",
  residenceBand:
    "https://www.gov.uk/guidance/check-if-you-can-get-an-additional-inheritance-tax-threshold",
  transferResidence:
    "https://www.gov.uk/guidance/inheritance-tax-transfer-of-threshold",
  transferBasic:
    "https://www.gov.uk/guidance/transferring-unused-basic-threshold-for-inheritance-tax",
  calculator:
    "https://www.tax.service.gov.uk/calculate-additional-inheritance-tax-threshold",
  iht436:
    "https://www.gov.uk/government/publications/claim-to-transfer-any-unused-residence-nil-rate-band-iht436",
  iht402:
    "https://www.gov.uk/government/publications/inheritance-tax-claim-to-transfer-unused-nil-rate-band-iht402",
} as const;
