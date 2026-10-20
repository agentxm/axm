import * as Equal from "effect/Equal";
import * as Predicate from "effect/Predicate";
import { emitToolTables } from "./toml.js";
import { prepareDocumentRoundTrip, type DocumentRoundTripContext } from "../document-round-trip.js";
import { LOCKFILE_VERSION } from "./schema.js";
import { PROJECTION_KINDS } from "./projections.js";
import { LockfileWriteError } from "./errors.js";
import { parseLockfileToml, type ParsedLockfileToml } from "./toml-values.js";

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

export const prepareLockfileRoundTrip = (args: {
  readonly context: DocumentRoundTripContext;
  readonly target: string;
  readonly before: string | undefined;
  readonly after: string;
}) => {
  const before =
    args.before === undefined
      ? { document: { version: LOCKFILE_VERSION }, tool: undefined }
      : parse(args.before);
  const after = parse(args.after);
  const insertions: string[] = [];
  const withdrawals: string[] = [];
  // Package records are derived from bindings; eligibility belongs to the selected units.
  if (before !== undefined && after !== undefined) {
    const prior = bindingUnits(before.document);
    const next = bindingUnits(after.document);
    for (const unit of next) if (!prior.has(unit)) insertions.push(unit);
    for (const unit of prior) if (!next.has(unit)) withdrawals.push(unit);
  }
  // Projection rows follow the extension resolutions that render them, as
  // package records do: a write that introduces or withdraws a resolution is
  // that one unit, rows included. Only a write that changes rows alone treats
  // each introduced or withdrawn row as a unit. A changed row is neither;
  // exact restoration still requires the restored document to equal the
  // computed one.
  if (
    before !== undefined &&
    after !== undefined &&
    insertions.length === 0 &&
    withdrawals.length === 0
  )
    for (const kind of PROJECTION_KINDS) {
      const prior = projectionUnits(before.document, kind);
      const next = projectionUnits(after.document, kind);
      for (const path of Object.keys(next))
        if (!Object.hasOwn(prior, path))
          insertions.push(JSON.stringify(["lockfile", "projections", kind, path]));
      for (const path of Object.keys(prior))
        if (!Object.hasOwn(next, path))
          withdrawals.push(JSON.stringify(["lockfile", "projections", kind, path]));
    }
  return prepareDocumentRoundTrip({
    ...args,
    unitPrefix: '["lockfile",',
    insertions,
    withdrawals,
    acceptAbsent:
      after !== undefined &&
      after.tool === undefined &&
      Equal.equals(normalize(after.document), { version: LOCKFILE_VERSION }),
    acceptRestored: (raw) => {
      const restored = parse(raw);
      return (
        restored !== undefined &&
        after !== undefined &&
        Equal.equals(normalize(restored.document), normalize(after.document)) &&
        Equal.equals(emitToolTables(restored.tool), emitToolTables(after.tool))
      );
    },
    mapFailure: (target, cause) =>
      cause instanceof LockfileWriteError
        ? cause
        : new LockfileWriteError({ path: target, step: "write-temp", cause }),
  });
};
