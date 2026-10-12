import * as Equal from "effect/Equal";
import YAML from "yaml";
import { prepareDocumentRoundTrip, type DocumentRoundTripContext } from "../document-round-trip.js";
import { LOCKFILE_VERSION } from "./schema.js";
import { PROJECTION_KINDS } from "./projections.js";
import { LockfileWriteError } from "./errors.js";

const maps = [
  "packages",
  "skills",
  "mcpServers",
  "subagents",
  "rules",
  "hooks",
  "knowledge",
  "packs",
];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const parse = (raw: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = YAML.parse(raw);
    return record(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
const entries = (document: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = document[key];
  return record(value) ? value : {};
};
const projectionUnits = (
  document: Record<string, unknown>,
  kind: string,
): Record<string, unknown> => entries(entries(entries(document, "projections"), kind), "units");
const normalize = (document: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(document).filter(
      ([key, value]) => !maps.includes(key) || !record(value) || Object.keys(value).length > 0,
    ),
  );

export const prepareLockfileRoundTrip = (args: {
  readonly context: DocumentRoundTripContext;
  readonly target: string;
  readonly before: string | undefined;
  readonly after: string;
}) => {
  const before =
    args.before === undefined
      ? { lockfileVersion: LOCKFILE_VERSION, skills: {} }
      : parse(args.before);
  const after = parse(args.after);
  const insertions: string[] = [];
  const withdrawals: string[] = [];
  if (before !== undefined && after !== undefined)
    for (const map of maps) {
      // Package records are derived from bindings; eligibility belongs to the selected units.
      if (map === "packages") continue;
      const prior = entries(before, map);
      const next = entries(after, map);
      for (const name of Object.keys(next))
        if (!Object.hasOwn(prior, name)) insertions.push(JSON.stringify(["lockfile", map, name]));
      for (const name of Object.keys(prior))
        if (!Object.hasOwn(next, name)) withdrawals.push(JSON.stringify(["lockfile", map, name]));
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
      const prior = projectionUnits(before, kind);
      const next = projectionUnits(after, kind);
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
      after !== undefined && Equal.equals(normalize(after), { lockfileVersion: LOCKFILE_VERSION }),
    acceptRestored: (raw) => {
      const restored = parse(raw);
      return (
        restored !== undefined &&
        after !== undefined &&
        Equal.equals(normalize(restored), normalize(after))
      );
    },
    mapFailure: (target, cause) =>
      cause instanceof LockfileWriteError
        ? cause
        : new LockfileWriteError({ path: target, step: "write-temp", cause }),
  });
};

/**
 * Update projection rows in place. A kind whose unit set changes is rewritten
 * whole so its units stay sorted; otherwise only the changed rows and the
 * contract are set.
 */
const renderProjectionsUpdate = (
  document: YAML.Document,
  prior: Record<string, unknown>,
  encoded: Record<string, unknown>,
): void => {
  const next = encoded["projections"];
  if (Equal.equals(prior["projections"], next)) return;
  if (!record(next)) {
    document.delete("projections");
    return;
  }
  if (!record(prior["projections"])) {
    document.set("projections", next);
    return;
  }
  const previous = prior["projections"];
  for (const kind of PROJECTION_KINDS) {
    const before = previous[kind];
    const after = next[kind];
    if (Equal.equals(before, after)) continue;
    if (!record(after)) {
      document.deleteIn(["projections", kind]);
      continue;
    }
    const priorUnits = projectionUnits(prior, kind);
    const nextUnits = projectionUnits(encoded, kind);
    if (!record(before) || !Equal.equals(Object.keys(priorUnits), Object.keys(nextUnits))) {
      document.setIn(["projections", kind], after);
      continue;
    }
    if (!Equal.equals(before["contract"], after["contract"]))
      document.setIn(["projections", kind, "contract"], after["contract"]);
    for (const [path, row] of Object.entries(nextUnits))
      if (!Equal.equals(priorUnits[path], row))
        document.setIn(["projections", kind, "units", path], row);
  }
};

/** YAML owns comments and anchors; update only the changed authoritative keys. */
export const renderLockfileUpdate = (before: string, encoded: Record<string, unknown>): string => {
  const document = YAML.parseDocument(before, { keepSourceTokens: true });
  if (document.errors.length > 0) throw new Error("Invalid lockfile YAML");
  const prior: unknown = document.toJS();
  if (!record(prior)) throw new Error("Lockfile root must be a mapping");
  for (const map of maps) {
    const previous = entries(prior, map);
    const next = entries(encoded, map);
    for (const key of Object.keys(previous))
      if (!Object.hasOwn(next, key)) document.deleteIn([map, key]);
    for (const [key, value] of Object.entries(next))
      if (!Equal.equals(previous[key], value)) document.setIn([map, key], value);
    if (encoded[map] === undefined && Object.hasOwn(prior, map)) document.delete(map);
    else if (!Object.hasOwn(prior, map) && record(encoded[map]) && Object.keys(next).length === 0)
      document.set(map, {});
  }
  renderProjectionsUpdate(document, prior, encoded);
  if (!Equal.equals(prior["lockfileVersion"], encoded["lockfileVersion"]))
    document.set("lockfileVersion", encoded["lockfileVersion"]);
  const expected: Record<string, unknown> = { ...prior, ...encoded };
  for (const map of maps) if (encoded[map] === undefined) delete expected[map];
  if (encoded["projections"] === undefined) delete expected["projections"];
  const actual: unknown = document.toJS();
  if (!Equal.equals(expected, actual))
    throw new Error("Lockfile update would change unrelated aliased values");
  if (Equal.equals(prior, actual)) return before;
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  return (
    document.toString({ lineWidth: 0 }).trimEnd().replaceAll("\n", eol) +
    (before.match(/\s*$/)?.[0] ?? "")
  );
};
