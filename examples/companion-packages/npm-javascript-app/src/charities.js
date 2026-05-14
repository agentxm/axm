// @ts-check

/**
 * @typedef {object} Charity
 * @property {string} slug
 * @property {string} name
 * @property {string} focus
 * @property {string} description
 * @property {string} url
 * @property {string} ratingNote
 */

/** @type {readonly Charity[]} */
export const ALL_CHARITIES = Object.freeze([
  {
    slug: "best-friends",
    name: "Best Friends Animal Society",
    focus: "shelters",
    description: "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
    url: "https://bestfriends.org/donate",
    ratingNote: "Charity Navigator 4-star",
  },
  {
    slug: "petsmart-charities",
    name: "PetSmart Charities",
    focus: "shelters",
    description: "Grants to local shelters; spay/neuter; adoption events.",
    url: "https://petsmartcharities.org/donate",
    ratingNote: "Charity Navigator 4-star (96% program ratio)",
  },
  {
    slug: "brother-wolf",
    name: "Brother Wolf Animal Rescue",
    focus: "rescue",
    description: "Local rescue with national-impact outreach programs.",
    url: "https://bwar.org/donate",
    ratingNote: "Charity Navigator 4-star, GuideStar Platinum",
  },
  {
    slug: "animal-welfare-institute",
    name: "Animal Welfare Institute",
    focus: "policy",
    description: "Policy and advocacy reducing cruelty inflicted on animals.",
    url: "https://awionline.org/donate",
    ratingNote: "Charity Navigator 4-star",
  },
  {
    slug: "aspca",
    name: "ASPCA",
    focus: "shelters",
    description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
    url: "https://www.aspca.org/donate",
    ratingNote: "Charity Navigator 4-star",
  },
]);

export const CHARITIES_DISCLAIMER =
  "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving.";

/**
 * @param {string} slug
 * @returns {Charity | undefined}
 */
export function findCharityBySlug(slug) {
  const target = slug.toLowerCase();
  return ALL_CHARITIES.find((charity) => charity.slug.toLowerCase() === target);
}

/**
 * @param {string} focus
 * @returns {readonly Charity[]}
 */
export function filterCharitiesByFocus(focus) {
  if (focus.toLowerCase() === "all") return ALL_CHARITIES;
  const target = focus.toLowerCase();
  return ALL_CHARITIES.filter((c) => c.focus.toLowerCase() === target);
}
