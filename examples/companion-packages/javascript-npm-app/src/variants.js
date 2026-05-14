// @ts-check

/** @typedef {"compact" | "detailed" | "playful"} PetCardStyle */
/** @typedef {"popularity" | "match-quiz" | "longest-stay"} MatchStrategy */
/** @typedef {"short" | "standard" | "thorough"} MatchDepth */
/** @typedef {"all" | "shelters" | "rescue"} DonateFocus */

const PET_CARD_STYLES = /** @type {readonly PetCardStyle[]} */ (["compact", "detailed", "playful"]);

const MATCH_STRATEGIES = /** @type {readonly MatchStrategy[]} */ ([
  "popularity",
  "match-quiz",
  "longest-stay",
]);

const MATCH_DEPTHS = /** @type {readonly MatchDepth[]} */ (["short", "standard", "thorough"]);

const DONATE_FOCUSES = /** @type {readonly DonateFocus[]} */ (["all", "shelters", "rescue"]);

/**
 * @template {string} T
 * @param {string} value
 * @param {readonly T[]} allowed
 * @param {string} label
 * @returns {T}
 */
function parseEnumVariant(value, allowed, label) {
  if (!allowed.includes(/** @type {T} */ (value))) {
    throw new Error(`Unknown ${label} variant '${value}'.`);
  }
  return /** @type {T} */ (value);
}

/**
 * @param {string} value
 * @returns {PetCardStyle}
 */
export function parsePetCardStyle(value) {
  return parseEnumVariant(value, PET_CARD_STYLES, "PetCardStyle");
}

/**
 * @param {string} value
 * @returns {MatchStrategy}
 */
export function parseMatchStrategy(value) {
  return parseEnumVariant(value, MATCH_STRATEGIES, "MatchStrategy");
}

/**
 * @param {string} value
 * @returns {MatchDepth}
 */
export function parseMatchDepth(value) {
  return parseEnumVariant(value, MATCH_DEPTHS, "MatchDepth");
}

/**
 * @param {string} value
 * @returns {DonateFocus}
 */
export function parseDonateFocus(value) {
  return parseEnumVariant(value, DONATE_FOCUSES, "DonateFocus");
}
