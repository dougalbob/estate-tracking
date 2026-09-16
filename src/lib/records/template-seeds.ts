/**
 * Starter checklist suggestions.
 *
 * These are organisational prompts, not instructions or legal advice, and they
 * are deliberately worded as "consider / ask about" rather than "you must".
 * They are ordinary records: the user can edit the wording, remove any line, or
 * add their own, and nothing is turned into a task until they choose it.
 *
 * The lists reflect the situation described by the users: a private pension and
 * no employer scheme, no mortgage, gas and electricity with one supplier, and
 * separate broadband and mobile providers, in England, with no solicitor
 * involved and the estate not expected to pay Inheritance Tax. Tailoring is
 * wording only – each line can be removed or reworded in the app.
 *
 * Nothing here states a rule, a threshold, or an amount. Rules and figures
 * change, so every line points at the authority to check instead, and the app
 * deliberately performs no tax calculation.
 */
export type TemplateSeed = {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  sortOrder: number;
};

export const notificationsTemplateSeeds: TemplateSeed[] = [
  {
    id: "notif-tell-us-once",
    projectId: "notifications",
    title: "Tell Us Once",
    detail:
      "The registrar can give you a reference code for this government service. It reports the death to HMRC, the DWP, DVLA, the Passport Office and your council in one go.",
    sortOrder: 1,
  },
  {
    id: "notif-banks",
    projectId: "notifications",
    title: "Banks and building societies",
    detail:
      "Every current account, savings account and ISA. Ask what they need – usually the death certificate – and whether the accounts are frozen in the meantime.",
    sortOrder: 2,
  },
  {
    id: "notif-pension",
    projectId: "notifications",
    title: "Private pension provider",
    detail:
      "There was no employer scheme, so this is the private pension. Tell the scheme and ask what they need and what the scheme offers; there is no need to decide anything on the first call.",
    sortOrder: 3,
  },
  {
    id: "notif-council-tax",
    projectId: "notifications",
    title: "Council tax",
    detail:
      "Tell your council the property is empty now and ask which exemptions or discounts apply to it.",
    sortOrder: 4,
  },
  {
    id: "notif-energy",
    projectId: "notifications",
    title: "Energy supplier (gas and electricity)",
    detail:
      "One call covers both, since the gas and electricity are with the same supplier. Ask about closing or transferring the account and any final bill.",
    sortOrder: 5,
  },
  {
    id: "notif-water",
    projectId: "notifications",
    title: "Water company",
    detail:
      "Let them know the property is empty and ask about closing or transferring the account.",
    sortOrder: 6,
  },
  {
    id: "notif-broadband",
    projectId: "notifications",
    title: "Broadband and landline provider",
    detail:
      "Ask what notice period applies, and whether any equipment needs returning.",
    sortOrder: 7,
  },
  {
    id: "notif-mobile",
    projectId: "notifications",
    title: "Mobile phone provider",
    detail:
      "Ask about notice, and whether anything is still owed on the handset or contract.",
    sortOrder: 8,
  },
  {
    id: "notif-tv-licence",
    projectId: "notifications",
    title: "TV Licence",
    detail:
      "Tell TV Licensing. Ask about cancelling the licence and about a refund for the unused part of the year.",
    sortOrder: 9,
  },
  {
    id: "notif-home-insurance",
    projectId: "notifications",
    title: "Home and contents insurance",
    detail:
      "There is no mortgage lender to notify, so the insurer is the one to call. Ask what cover continues while the property is empty – policies often set limits, so it is worth a direct question.",
    sortOrder: 10,
  },
  {
    id: "notif-post",
    projectId: "notifications",
    title: "Royal Mail redirection",
    detail:
      "A paid service that forwards post to you for a set period. Useful while the house is being cleared, and it reduces post arriving at an empty address.",
    sortOrder: 11,
  },
  {
    id: "notif-subscriptions",
    projectId: "notifications",
    title: "Subscriptions and regular payments",
    detail:
      "Magazines, streaming, gym, clubs, charity donations. Recent bank or card statements usually reveal all of them at once.",
    sortOrder: 12,
  },
  {
    id: "notif-credit-agencies",
    projectId: "notifications",
    title: "Credit reference agencies",
    detail:
      "Telling them helps guard against fraud and can reveal open accounts you did not know about. It also avoids lenders writing to an unoccupied address.",
    sortOrder: 13,
  },
  {
    id: "notif-car",
    projectId: "notifications",
    title: "Car insurer and DVLA",
    detail:
      "Only if there is a vehicle or a driving licence to deal with. Tell the insurer, and check with DVLA about the licence and about the registered keeper of any car.",
    sortOrder: 14,
  },
  {
    id: "notif-other-services",
    projectId: "notifications",
    title: "Doctor, dentist and similar services",
    detail:
      "GP surgery, dentist, optician, and any clinics or services they used regularly. Also worth a thought: clubs, hobbies, and anyone who would want to know.",
    sortOrder: 15,
  },
];

/** Probate and estate administration, for an English estate with no solicitor. */
export const probateTemplateSeeds: TemplateSeed[] = [
  {
    id: "probate-grant-needed",
    projectId: "probate",
    title: "Confirm whether a grant is needed at all",
    detail:
      "Jointly owned assets, anything passing to a surviving spouse, and small balances can sometimes be released without a grant. Ask each institution what it needs from you before assuming probate is required.",
    sortOrder: 1,
  },
  {
    id: "probate-find-will",
    projectId: "probate",
    title: "Find the will and check who can apply",
    detail:
      "The will names the executors, and any of them can apply. Keep the original safe – the probate service asks for it. If there is no will, different rules decide who may apply, and the grant is called letters of administration instead.",
    sortOrder: 2,
  },
  {
    id: "probate-applicants",
    projectId: "probate",
    title: "Decide who applies for the grant",
    detail:
      "You can both be named on one grant, or one of you can apply while the other steps back – that is called reserving power. Decide this early, because the application asks for it.",
    sortOrder: 3,
  },
  {
    id: "probate-value-estate",
    projectId: "probate",
    title: "Value the estate as at the date of death",
    detail:
      "Property, accounts, investments, premium bonds, the car, household contents, jewellery, and money owed to the estate; then the debts, such as cards, final bills, care fees, and the funeral account. Values are as at the date of death, not today. Record each asset and liability in Estate finances as you go.",
    sortOrder: 4,
  },
  {
    id: "probate-property-valuation",
    projectId: "probate",
    title: "Get the property valued as at the date of death",
    detail:
      "An estate agent or surveyor can provide a written valuation for that date. It is needed for the application even if you plan to sell later, and it is worth keeping for comparison with any eventual sale price.",
    sortOrder: 5,
  },
  {
    id: "probate-balances",
    projectId: "probate",
    title: "Ask each institution for the balance at the date of death",
    detail:
      "Banks, building societies, investment providers and pension schemes each need telling separately, and each will confirm the figure in writing. Ask for it in writing so the application figures have a source.",
    sortOrder: 6,
  },
  {
    id: "probate-gifts",
    projectId: "probate",
    title: "Check for gifts made in the seven years before death",
    detail:
      "Larger gifts made in that period can affect both the allowances available and the forms HMRC expects. Bank statements and the person's own records are the usual starting point.",
    sortOrder: 7,
  },
  {
    id: "probate-iht-forms",
    projectId: "probate",
    title: "Confirm with HMRC whether an Inheritance Tax account is needed",
    detail:
      "No tax to pay does not always mean no paperwork: an estate that is above the basic allowance, and does not pass wholly to a spouse or charity, may still need a full account (form IHT400) before probate, because allowances have to be claimed. The GOV.UK checker and HMRC's helpline settle it for your figures. This app deliberately does not calculate tax.",
    sortOrder: 8,
  },
  {
    id: "probate-transferable-allowance",
    projectId: "probate",
    title: "Check whether an unused allowance can be transferred",
    detail:
      "If the person was widowed or had a deceased civil partner, unused allowances from that earlier death may be transferable, which can raise the amount available. Worth asking HMRC about directly, as it often changes which forms are needed.",
    sortOrder: 9,
  },
  {
    id: "probate-apply",
    projectId: "probate",
    title: "Apply for the grant",
    detail:
      "The GOV.UK online service takes you through it, and asks for the will, the death certificate, the estate figures, and – where HMRC has given you one – a reference code. Applying online is usually the quickest route, and no solicitor is required for a straightforward estate.",
    sortOrder: 10,
  },
  {
    id: "probate-statement-of-truth",
    projectId: "probate",
    title: "Sign the statement of truth (or swear the oath)",
    detail:
      "An online application ends with a statement of truth that each applicant signs. A paper application needs the oath sworn instead, which a solicitor or the probate registry can do for a small fee.",
    sortOrder: 11,
  },
  {
    id: "probate-fee-and-copies",
    projectId: "probate",
    title: "Pay the fee and order extra copies of the grant",
    detail:
      "A fee applies above a small estate threshold, and GOV.UK lists the current amount – check it rather than relying on an older figure. Order more official copies than you think you need: institutions usually want their own, and copies are cheaper now than a second application later.",
    sortOrder: 12,
  },
  {
    id: "probate-wait",
    projectId: "probate",
    title: "Wait for the grant, and don't promise dates meanwhile",
    detail:
      "Processing times move, so check the current estimate on GOV.UK before telling anyone when things will happen. Property usually cannot be sold or transferred until the grant is issued, so keep the estate's plans flexible.",
    sortOrder: 13,
  },
  {
    id: "probate-register-grant",
    projectId: "probate",
    title: "Register the grant with each institution",
    detail:
      "Banks, investment providers, pension schemes, the Land Registry and others each have their own process, and some accept a scanned copy while others want an official copy posted. Work through them one at a time and note who has what.",
    sortOrder: 14,
  },
  {
    id: "probate-pay-debts",
    projectId: "probate",
    title: "Pay the funeral account and the estate's debts",
    detail:
      "Funeral costs and debts are normally paid from the estate's money before anything is distributed. Record each payment against the right liability in Estate finances, so the outstanding amounts stay accurate.",
    sortOrder: 15,
  },
  {
    id: "probate-property",
    projectId: "probate",
    title: "Decide what happens to the property",
    detail:
      "Tell the insurer it is empty and check what cover continues, keep utilities to a minimum while it is unoccupied, and secure it. Then decide on sale, transfer, or keeping it. If clearing it is a project of its own, create one so the work has somewhere to live.",
    sortOrder: 16,
  },
  {
    id: "probate-estate-accounts",
    projectId: "probate",
    title: "Keep estate accounts and the paperwork together",
    detail:
      "A running record of money in and out, from the date of death to the final distribution. You may need to show it to HMRC or to anyone who asks about the estate. Store the will, the grant, valuations, correspondence and receipts here as documents.",
    sortOrder: 17,
  },
  {
    id: "probate-income-tax",
    projectId: "probate",
    title: "Check whether the estate needs to report income",
    detail:
      "Interest, rent or other income arising after the death can need reporting to HMRC, and the person may have had a tax return outstanding. The helpline can confirm whether anything is expected for this estate.",
    sortOrder: 18,
  },
  {
    id: "probate-creditors",
    projectId: "probate",
    title: "Consider advertising for unknown creditors",
    detail:
      "A notice in The Gazette, and sometimes a local paper, invites anyone owed money to come forward. It is optional, but it protects the executors from being personally responsible for a debt that surfaces after distribution.",
    sortOrder: 19,
  },
  {
    id: "probate-distribute",
    projectId: "probate",
    title: "Distribute to the beneficiaries, keeping a reserve",
    detail:
      "Interim distributions can be made once the debts are known, with the final balance at the end. Hold something back for unexpected costs until you are confident, and record each distribution in Estate finances – no split is assumed there.",
    sortOrder: 20,
  },
  {
    id: "probate-advice",
    projectId: "probate",
    title: "Know when to get advice, even without a solicitor",
    detail:
      "A straightforward estate can be handled without one. Get advice if there is a dispute, a missing or unclear will, a trust, a business, property abroad, or anything about Inheritance Tax you are unsure of – and remember a fixed-fee service can be limited to just the tricky part.",
    sortOrder: 21,
  },
];

/** Every starter list, in project order. */
export const templateSeeds: TemplateSeed[] = [
  ...notificationsTemplateSeeds,
  ...probateTemplateSeeds,
];
