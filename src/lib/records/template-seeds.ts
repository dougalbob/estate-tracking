/**
 * Starter checklist suggestions.
 *
 * These are organisational prompts, not instructions or legal advice, and they
 * are deliberately worded as "consider / ask about" rather than "you must".
 * They are ordinary records: the user can edit the wording, remove any line, or
 * add their own, and nothing is turned into a task until they choose it.
 *
 * This list reflects the situation described by the users: a private pension and
 * no employer scheme, no mortgage, gas and electricity with one supplier, and
 * separate broadband and mobile providers. Tailoring is wording only – each line
 * can be removed or reworded in the app.
 */
export type TemplateSeed = {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  sortOrder: number;
};

export const templateSeeds: TemplateSeed[] = [
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
