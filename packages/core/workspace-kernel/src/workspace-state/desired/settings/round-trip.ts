/** Guarded syntax inverses for newly declared settings intent. */
import * as Equal from "effect/Equal";
import { prepareDocumentRoundTrip, type DocumentRoundTripContext } from "../document-round-trip.js";
import { SettingsWriteError } from "./errors.js";

export type SettingsRoundTripContext = DocumentRoundTripContext;

const entryMaps = ["skills", "mcpServers", "subagents", "rules", "hooks", "knowledge", "packs"];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const parse = (raw: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(raw);
    return record(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
const entries = (document: Record<string, unknown>, map: string): Record<string, unknown> => {
  const value = document[map];
  return record(value) ? value : {};
};
const unitKey = (map: string, name: string): string => JSON.stringify(["settings", map, name]);
const withoutEmptyMaps = (document: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(document).filter(([key, value]) =>
      key === "agents" && Array.isArray(value)
        ? value.length > 0
        : !entryMaps.includes(key) || !record(value) || Object.keys(value).length > 0,
    ),
  );
const agents = (document: Record<string, unknown>): ReadonlyArray<string> => {
  const value = document["agents"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
};

/** Called inside the settings mutation boundary, with exact pre/post images. */
export const prepareSettingsRoundTrip = (args: {
  readonly context: SettingsRoundTripContext;
  readonly settingsPath: string;
  readonly before: string;
  readonly after: string;
}) => {
  const before = parse(args.before);
  const after = parse(args.after);
  const added: Array<{ readonly unit: string; readonly declaration: unknown }> = [];
  const removed = new Set<string>();
  if (before !== undefined && after !== undefined)
    for (const map of entryMaps) {
      const prior = entries(before, map);
      const next = entries(after, map);
      for (const [name, declaration] of Object.entries(next))
        if (!Object.hasOwn(prior, name)) added.push({ unit: unitKey(map, name), declaration });
      for (const name of Object.keys(prior))
        if (!Object.hasOwn(next, name)) removed.add(unitKey(map, name));
    }
  if (before !== undefined && after !== undefined) {
    const prior = agents(before);
    const next = agents(after);
    for (const agent of next)
      if (!prior.includes(agent))
        added.push({ unit: unitKey("agents", agent), declaration: agent });
    for (const agent of prior) if (!next.includes(agent)) removed.add(unitKey("agents", agent));
  }
  const eligible = added.every(
    ({ declaration }) =>
      typeof declaration === "string" ||
      (record(declaration) && declaration["kind"] !== "configuration"),
  );
  return prepareDocumentRoundTrip({
    context: { ...args.context, eligible: args.context.eligible && eligible },
    target: args.settingsPath,
    before: args.before,
    after: args.after,
    unitPrefix: '["settings",',
    insertions: added.map(({ unit }) => unit),
    withdrawals: [...removed],
    acceptRestored: (raw) => {
      const restored = parse(raw);
      return (
        restored !== undefined &&
        after !== undefined &&
        Equal.equals(withoutEmptyMaps(restored), withoutEmptyMaps(after))
      );
    },
    mapFailure: (target, cause) =>
      cause instanceof SettingsWriteError
        ? cause
        : new SettingsWriteError({ path: target, step: "write-temp", cause }),
  });
};
