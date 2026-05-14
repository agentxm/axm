export type PetCardStyle = "compact" | "detailed" | "playful";
export type MatchStrategy = "popularity" | "match-quiz" | "longest-stay";
export type MatchDepth = "short" | "standard" | "thorough";
export type DonateFocus = "all" | "shelters" | "rescue" | "policy";

const PET_CARD_STYLES: readonly PetCardStyle[] = ["compact", "detailed", "playful"];
const MATCH_STRATEGIES: readonly MatchStrategy[] = ["popularity", "match-quiz", "longest-stay"];
const MATCH_DEPTHS: readonly MatchDepth[] = ["short", "standard", "thorough"];
const DONATE_FOCUSES: readonly DonateFocus[] = ["all", "shelters", "rescue", "policy"];

function parseEnumVariant<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): T {
  const candidate = allowed.find((entry) => entry === value);
  if (candidate === undefined) {
    throw new Error(`Unknown ${label} variant '${value}'.`);
  }
  return candidate;
}

export function parsePetCardStyle(value: string): PetCardStyle {
  return parseEnumVariant(value, PET_CARD_STYLES, "PetCardStyle");
}

export function parseMatchStrategy(value: string): MatchStrategy {
  return parseEnumVariant(value, MATCH_STRATEGIES, "MatchStrategy");
}

export function parseMatchDepth(value: string): MatchDepth {
  return parseEnumVariant(value, MATCH_DEPTHS, "MatchDepth");
}

export function parseDonateFocus(value: string): DonateFocus {
  return parseEnumVariant(value, DONATE_FOCUSES, "DonateFocus");
}
