export interface MatchPreferences {
  readonly hasKids: boolean;
  readonly quietHome: boolean;
  readonly active: boolean;
  readonly firstTime: boolean;
  readonly multiplePets: boolean;
  readonly smallHome: boolean;
}

export function activeFlagSet(prefs: MatchPreferences): Set<string> {
  const set = new Set<string>();
  if (prefs.hasKids) set.add("has-kids");
  if (prefs.quietHome) set.add("quiet-home");
  if (prefs.active) set.add("active");
  if (prefs.firstTime) set.add("first-time");
  if (prefs.multiplePets) set.add("multiple-pets");
  if (prefs.smallHome) set.add("small-home");
  return set;
}

export function isEmpty(prefs: MatchPreferences): boolean {
  return (
    !prefs.hasKids &&
    !prefs.quietHome &&
    !prefs.active &&
    !prefs.firstTime &&
    !prefs.multiplePets &&
    !prefs.smallHome
  );
}
