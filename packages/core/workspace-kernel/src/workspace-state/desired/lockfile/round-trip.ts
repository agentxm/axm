import { withWork } from "@agentxm/host-primitives/work-observation";
import * as Equal from "effect/Equal";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { emitToolTables } from "./toml.js";
import { prepareDocumentRoundTrip, type DocumentRoundTripContext } from "../document-round-trip.js";
import { LOCKFILE_VERSION } from "./schema.js";
import { PROJECTION_KINDS } from "./projections.js";
import { LockfileWriteError } from "./errors.js";
import { parseLockfileToml, type ParsedLockfileToml } from "./toml-values.js";
import { freezeWorkspaceValue } from "../freeze-value.js";

/** Binding tables keyed by local alias. */
const tables = ["skills", "subagents", "rules", "hooks", "knowledge", "packs"];
/** Array tables, dropped when empty so an empty array equals an absent one. */
const arrays = ["package", "mcp"];

const parse = (raw: string): ParsedLockfileToml | undefined => {
  try {
    return parseLockfileToml(raw);
  } catch {
    return undefined;
  }
};
const entries = (document: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = document[key];
  return Predicate.isObject(value) ? value : {};
};
const projectionUnits = (
  document: Record<string, unknown>,
  kind: string,
): Record<string, unknown> => entries(entries(entries(document, "projections"), kind), "units");
const normalize = (document: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(document).filter(
      ([key, value]) =>
        !(tables.includes(key) && Predicate.isObject(value) && Object.keys(value).length === 0) &&
        !(arrays.includes(key) && Array.isArray(value) && value.length === 0),
    ),
  );

/**
 * The selected units a document records: one per alias-keyed binding, and
 * one per MCP binding identified by its package and declared name.
 */
const bindingUnits = (document: Record<string, unknown>): ReadonlySet<string> => {
  const units = new Set<string>();
  for (const table of tables)
    for (const alias of Object.keys(entries(document, table)))
      units.add(JSON.stringify(["lockfile", table, alias]));
  const mcp = document["mcp"];
  if (Array.isArray(mcp))
    for (const binding of mcp)
      if (Predicate.isObject(binding))
        units.add(JSON.stringify(["lockfile", "mcp", binding["package"], binding["name"]]));
  return units;
};

/**
 * The round-trip unit keys a prior document records, in document order. Only
 * these strings leave the writer's parse; its document and tool values do not.
 */
interface PriorRoundTripUnits {
  readonly bindings: ReadonlyArray<string>;
  readonly projections: ReadonlyArray<readonly [kind: string, paths: ReadonlyArray<string>]>;
}

/** Derive the prior's unit keys from the document the writer already parsed. */
export const priorRoundTripUnits = (document: Record<string, unknown>): PriorRoundTripUnits =>
  freezeWorkspaceValue({
    bindings: [...bindingUnits(document)],
    projections: PROJECTION_KINDS.map((kind): readonly [string, ReadonlyArray<string>] => [
      kind,
      Object.keys(projectionUnits(document, kind)),
    ]),
  });

/** An absent prior reads as a document with no units. */
const absentPriorUnits = priorRoundTripUnits({ version: LOCKFILE_VERSION });

export const prepareLockfileRoundTrip = (args: {
  readonly context: DocumentRoundTripContext;
  readonly target: string;
  /** The exact prior image and the units derived from its writer parse. */
  readonly before: { readonly raw: string; readonly units: PriorRoundTripUnits } | undefined;
  readonly after: string;
}) =>
  Effect.gen(function* () {
    const before = args.before?.units ?? absentPriorUnits;
    const after = yield* Effect.sync(() => parse(args.after)).pipe((effect) =>
      withWork("axm.parse.lockfile-round-trip", effect, {
        attributes: { "axm.work.count": 1, "axm.parse.phase": "after" },
      }),
    );
    const insertions: string[] = [];
    const withdrawals: string[] = [];
    // Package records are derived from bindings; eligibility belongs to the selected units.
    if (after !== undefined) {
      const prior = new Set(before.bindings);
      const next = bindingUnits(after.document);
      for (const unit of next) if (!prior.has(unit)) insertions.push(unit);
      for (const unit of before.bindings) if (!next.has(unit)) withdrawals.push(unit);
    }
    // Projection rows follow the extension resolutions that render them, as
    // package records do: a write that introduces or withdraws a resolution is
    // that one unit, rows included. Only a write that changes rows alone treats
    // each introduced or withdrawn row as a unit. A changed row is neither;
    // exact restoration still requires the restored document to equal the
    // computed one.
    if (after !== undefined && insertions.length === 0 && withdrawals.length === 0)
      for (const [kind, priorPaths] of before.projections) {
        const prior = new Set(priorPaths);
        const next = projectionUnits(after.document, kind);
        for (const path of Object.keys(next))
          if (!prior.has(path))
            insertions.push(JSON.stringify(["lockfile", "projections", kind, path]));
        for (const path of priorPaths)
          if (!Object.hasOwn(next, path))
            withdrawals.push(JSON.stringify(["lockfile", "projections", kind, path]));
      }
    return yield* prepareDocumentRoundTrip({
      context: args.context,
      target: args.target,
      before: args.before?.raw,
      after: args.after,
      unitPrefix: '["lockfile",',
      insertions,
      withdrawals,
      acceptAbsent:
        after !== undefined &&
        after.tool === undefined &&
        Equal.equals(normalize(after.document), { version: LOCKFILE_VERSION }),
      acceptRestored: (raw) =>
        Effect.gen(function* () {
          const restored = yield* Effect.sync(() => parse(raw)).pipe((effect) =>
            withWork("axm.parse.lockfile-round-trip", effect, {
              attributes: { "axm.work.count": 1, "axm.parse.phase": "restored" },
            }),
          );
          return (
            restored !== undefined &&
            after !== undefined &&
            Equal.equals(normalize(restored.document), normalize(after.document)) &&
            Equal.equals(emitToolTables(restored.tool), emitToolTables(after.tool))
          );
        }),
      mapFailure: (target, cause) =>
        cause instanceof LockfileWriteError
          ? cause
          : new LockfileWriteError({ path: target, step: "write-temp", cause }),
    });
  });
