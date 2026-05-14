// @ts-check

/**
 * @typedef {object} MatchPreferences
 * @property {boolean} hasKids
 * @property {boolean} quietHome
 * @property {boolean} active
 * @property {boolean} firstTime
 * @property {boolean} multiplePets
 * @property {boolean} smallHome
 */

/**
 * @param {MatchPreferences} prefs
 * @returns {Set<string>}
 */
export function activeFlagSet(prefs) {
  /** @type {Set<string>} */
  const set = new Set();
  if (prefs.hasKids) set.add("has-kids");
  if (prefs.quietHome) set.add("quiet-home");
  if (prefs.active) set.add("active");
  if (prefs.firstTime) set.add("first-time");
  if (prefs.multiplePets) set.add("multiple-pets");
  if (prefs.smallHome) set.add("small-home");
  return set;
}

/**
 * @param {MatchPreferences} prefs
 * @returns {boolean}
 */
export function isEmpty(prefs) {
  return (
    !prefs.hasKids &&
    !prefs.quietHome &&
    !prefs.active &&
    !prefs.firstTime &&
    !prefs.multiplePets &&
    !prefs.smallHome
  );
}
