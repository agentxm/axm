import { withWork } from "@agentxm/host-primitives/work-observation";
/** Guarded syntax inverses for newly declared settings intent. */
import * as Equal from "effect/Equal";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { prepareDocumentRoundTrip, type DocumentRoundTripContext } from "../document-round-trip.js";
import { SettingsWriteError } from "./errors.js";
import { SETTINGS_ENTRY_KEYS } from "./schema.js";

export type SettingsRoundTripContext = DocumentRoundTripContext;

/** The object view of one parsed settings image; `undefined` when the image holds no object. */
export interface ParsedSettingsImage {
  readonly document: Record<string, unknown> | undefined;
}

/** Derive the round-trip view of an image the caller already parsed (and froze). */
export const settingsImage = (value: unknown): ParsedSettingsImage => ({
  document: Predicate.isObject(value) ? value : undefined,
});

const entryMaps: ReadonlyArray<string> = Object.values(SETTINGS_ENTRY_KEYS);
const parse = (raw: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(raw);
    return Predicate.isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
const entries = (document: Record<string, unknown>, map: string): Record<string, unknown> => {
  const value = document[map];
  return Predicate.isObject(value) ? value : {};
};
const unitKey = (map: string, name: string): string => JSON.stringify(["settings", map, name]);
const withoutEmptyMaps = (document: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(document).filter(([key, value]) =>
      key === "agents" && Array.isArray(value)
        ? value.length > 0
        : !entryMaps.includes(key) || !Predicate.isObject(value) || Object.keys(value).length > 0,
    ),
  );
const agents = (document: Record<string, unknown>): ReadonlyArray<string> => {
  const value = document["agents"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
};

const parsePhase = (raw: string, phase: "before" | "after") =>
  Effect.sync(() => parse(raw)).pipe((effect) =>
    withWork("axm.parse.settings-round-trip", effect, {
      attributes: { "axm.work.count": 1, "axm.parse.phase": phase },
    }),
  );

/**
 * Called inside the settings mutation boundary, with exact pre/post images.
 * A supplied image view must be the caller's frozen parse of exactly that
 * string; an omitted view is parsed here.
 */
export const prepareSettingsRoundTrip = (args: {
  readonly context: SettingsRoundTripContext;
  readonly settingsPath: string;
  readonly before: string;
  readonly after: string;
  readonly beforeImage?: ParsedSettingsImage | undefined;
  readonly afterImage?: ParsedSettingsImage | undefined;
}) =>
  Effect.gen(function* () {
    const before =
      args.beforeImage === undefined
        ? yield* parsePhase(args.before, "before")
        : args.beforeImage.document;
    const after =
      args.afterImage === undefined
        ? yield* parsePhase(args.after, "after")
        : args.afterImage.document;
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
        (Predicate.isObject(declaration) && declaration["kind"] !== "configuration"),
    );
    return yield* prepareDocumentRoundTrip({
      context: { ...args.context, eligible: args.context.eligible && eligible },
      target: args.settingsPath,
      before: args.before,
      after: args.after,
      unitPrefix: '["settings",',
      insertions: added.map(({ unit }) => unit),
      withdrawals: [...removed],
      acceptRestored: (raw) =>
        Effect.gen(function* () {
          const restored = yield* Effect.sync(() => parse(raw)).pipe((effect) =>
            withWork("axm.parse.settings-round-trip", effect, {
              attributes: { "axm.work.count": 1, "axm.parse.phase": "restored" },
            }),
          );
          return (
            restored !== undefined &&
            after !== undefined &&
            Equal.equals(withoutEmptyMaps(restored), withoutEmptyMaps(after))
          );
        }),
      mapFailure: (target, cause) =>
        cause instanceof SettingsWriteError
          ? cause
          : new SettingsWriteError({ path: target, step: "write-temp", cause }),
    });
  });
